// A small hand-rolled GraphQL executor for the surface gh and github-mcp-server use.
// It parses the documents the conformance checks send and resolves them against the in-memory store.

import type { Store, Repo, Issue, PullRequest, IssueComment } from './store.ts';
import {
  addIssueComment,
  createIssue,
  createPullRequest,
  findIssue,
  findPullRequest,
  listComments,
  mergePullRequest,
  updateIssue,
} from './operations.ts';

// ---------------------------------------------------------------- lexer

interface Token {
  kind: 'name' | 'int' | 'float' | 'string' | 'punct' | 'eof';
  value: string;
}

function lex(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = source.length;
  while (i < n) {
    const c = source[i]!;
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === ',') {
      i += 1;
      continue;
    }
    if (c === '#') {
      while (i < n && source[i] !== '\n') i += 1;
      continue;
    }
    if (c === '.' && source.slice(i, i + 3) === '...') {
      tokens.push({ kind: 'punct', value: '...' });
      i += 3;
      continue;
    }
    if ('!$():=@[]{|}'.includes(c)) {
      tokens.push({ kind: 'punct', value: c });
      i += 1;
      continue;
    }
    if (c === '"') {
      if (source.slice(i, i + 3) === '"""') {
        i += 3;
        let out = '';
        while (i < n && source.slice(i, i + 3) !== '"""') {
          out += source[i]!;
          i += 1;
        }
        i += 3;
        tokens.push({ kind: 'string', value: out });
        continue;
      }
      i += 1;
      let out = '';
      while (i < n && source[i] !== '"') {
        let ch = source[i]!;
        if (ch === '\\') {
          i += 1;
          ch = source[i]!;
          if (ch === 'n') out += '\n';
          else if (ch === 'r') out += '\r';
          else if (ch === 't') out += '\t';
          else if (ch === 'b') out += '\b';
          else if (ch === 'f') out += '\f';
          else if (ch === 'u') {
            const hex = source.slice(i + 1, i + 5);
            out += String.fromCharCode(parseInt(hex, 16) || 0);
            i += 4;
          } else out += ch;
        } else out += ch;
        i += 1;
      }
      i += 1;
      tokens.push({ kind: 'string', value: out });
      continue;
    }
    if (c === '-' || (c >= '0' && c <= '9')) {
      let j = i + 1;
      while (j < n && /[0-9]/.test(source[j]!)) j += 1;
      let kind: 'int' | 'float' = 'int';
      if (source[j] === '.') {
        kind = 'float';
        j += 1;
        while (j < n && /[0-9]/.test(source[j]!)) j += 1;
      }
      if (source[j] === 'e' || source[j] === 'E') {
        kind = 'float';
        j += 1;
        if (source[j] === '+' || source[j] === '-') j += 1;
        while (j < n && /[0-9]/.test(source[j]!)) j += 1;
      }
      tokens.push({ kind, value: source.slice(i, j) });
      i = j;
      continue;
    }
    if (/[_A-Za-z]/.test(c)) {
      let j = i + 1;
      while (j < n && /[_0-9A-Za-z]/.test(source[j]!)) j += 1;
      tokens.push({ kind: 'name', value: source.slice(i, j) });
      i = j;
      continue;
    }
    // Unknown character: skip it rather than fail the whole document.
    i += 1;
  }
  tokens.push({ kind: 'eof', value: '' });
  return tokens;
}

// ---------------------------------------------------------------- parser AST

type ValueNode =
  | { kind: 'variable'; name: string }
  | { kind: 'literal'; value: unknown }
  | { kind: 'enum'; value: string }
  | { kind: 'list'; values: ValueNode[] }
  | { kind: 'object'; fields: Record<string, ValueNode> };

interface FieldNode {
  kind: 'field';
  alias?: string;
  name: string;
  args: Record<string, ValueNode>;
  selection: SelectionNode[];
}

interface InlineFragment {
  kind: 'inline';
  typeCondition: string | null;
  selection: SelectionNode[];
}

interface FragmentSpread {
  kind: 'spread';
  name: string;
}

type SelectionNode = FieldNode | InlineFragment | FragmentSpread;

interface OperationNode {
  operation: 'query' | 'mutation' | 'subscription';
  name: string | null;
  selection: SelectionNode[];
}

interface FragmentNode {
  name: string;
  typeCondition: string;
  selection: SelectionNode[];
}

class Parser {
  private readonly tokens: Token[];
  private index = 0;

  constructor(source: string) {
    this.tokens = lex(source);
  }

  private peek(): Token {
    return this.tokens[this.index]!;
  }

  private next(): Token {
    const token = this.tokens[this.index]!;
    if (token.kind !== 'eof') this.index += 1;
    return token;
  }

  private isPunct(value: string): boolean {
    const token = this.peek();
    return token.kind === 'punct' && token.value === value;
  }

  private expectPunct(value: string): void {
    const token = this.next();
    if (token.kind !== 'punct' || token.value !== value) {
      throw new Error(`expected ${value}, got ${token.value || token.kind}`);
    }
  }

  private expectName(): string {
    const token = this.next();
    if (token.kind !== 'name') throw new Error(`expected a name, got ${token.value || token.kind}`);
    return token.value;
  }

  parseDocument(): { operations: OperationNode[]; fragments: Map<string, FragmentNode> } {
    const operations: OperationNode[] = [];
    const fragments = new Map<string, FragmentNode>();
    while (this.peek().kind !== 'eof') {
      if (this.isPunct('{')) {
        operations.push({ operation: 'query', name: null, selection: this.parseSelectionSet() });
        continue;
      }
      const keyword = this.peek();
      if (keyword.kind === 'name' && (keyword.value === 'query' || keyword.value === 'mutation' || keyword.value === 'subscription')) {
        this.next();
        let name: string | null = null;
        if (this.peek().kind === 'name') name = this.next().value;
        if (this.isPunct('(')) this.parseVariableDefinitions();
        this.parseDirectives();
        operations.push({ operation: keyword.value as 'query' | 'mutation' | 'subscription', name, selection: this.parseSelectionSet() });
        continue;
      }
      if (keyword.kind === 'name' && keyword.value === 'fragment') {
        this.next();
        const name = this.expectName();
        const on = this.expectName();
        if (on !== 'on') throw new Error('expected "on" in a fragment definition');
        const typeCondition = this.expectName();
        this.parseDirectives();
        fragments.set(name, { name, typeCondition, selection: this.parseSelectionSet() });
        continue;
      }
      // Unknown top-level token: skip it.
      this.next();
    }
    if (operations.length === 0) throw new Error('the document holds no operation');
    return { operations, fragments };
  }

  private parseVariableDefinitions(): void {
    this.expectPunct('(');
    while (!this.isPunct(')') && this.peek().kind !== 'eof') {
      if (this.isPunct('$')) this.next();
      this.expectName();
      this.expectPunct(':');
      this.parseType();
      if (this.isPunct('=')) {
        this.next();
        this.parseValue();
      }
      this.parseDirectives();
    }
    this.expectPunct(')');
  }

  private parseType(): void {
    if (this.isPunct('[')) {
      this.next();
      this.parseType();
      this.expectPunct(']');
    } else {
      this.expectName();
    }
    if (this.isPunct('!')) this.next();
  }

  private parseDirectives(): void {
    while (this.isPunct('@')) {
      this.next();
      this.expectName();
      if (this.isPunct('(')) this.parseArguments();
    }
  }

  private parseSelectionSet(): SelectionNode[] {
    this.expectPunct('{');
    const selection: SelectionNode[] = [];
    while (!this.isPunct('}') && this.peek().kind !== 'eof') selection.push(this.parseSelection());
    this.expectPunct('}');
    return selection;
  }

  private parseSelection(): SelectionNode {
    if (this.isPunct('...')) {
      this.next();
      if (this.peek().kind === 'name' && this.peek().value === 'on') {
        this.next();
        const typeCondition = this.expectName();
        this.parseDirectives();
        return { kind: 'inline', typeCondition, selection: this.parseSelectionSet() };
      }
      const name = this.expectName();
      this.parseDirectives();
      return { kind: 'spread', name };
    }
    let name = this.expectName();
    let alias: string | undefined;
    if (this.isPunct(':')) {
      this.next();
      alias = name;
      name = this.expectName();
    }
    const args = this.isPunct('(') ? this.parseArguments() : {};
    this.parseDirectives();
    const selection = this.isPunct('{') ? this.parseSelectionSet() : [];
    return { kind: 'field', alias, name, args, selection };
  }

  private parseArguments(): Record<string, ValueNode> {
    this.expectPunct('(');
    const args: Record<string, ValueNode> = {};
    while (!this.isPunct(')') && this.peek().kind !== 'eof') {
      const name = this.expectName();
      this.expectPunct(':');
      args[name] = this.parseValue();
    }
    this.expectPunct(')');
    return args;
  }

  private parseValue(): ValueNode {
    const token = this.peek();
    if (this.isPunct('$')) {
      this.next();
      return { kind: 'variable', name: this.expectName() };
    }
    if (token.kind === 'int' || token.kind === 'float') {
      this.next();
      return { kind: 'literal', value: Number(token.value) };
    }
    if (token.kind === 'string') {
      this.next();
      return { kind: 'literal', value: token.value };
    }
    if (this.isPunct('[')) {
      this.next();
      const values: ValueNode[] = [];
      while (!this.isPunct(']') && this.peek().kind !== 'eof') values.push(this.parseValue());
      this.expectPunct(']');
      return { kind: 'list', values };
    }
    if (this.isPunct('{')) {
      this.next();
      const fields: Record<string, ValueNode> = {};
      while (!this.isPunct('}') && this.peek().kind !== 'eof') {
        const name = this.expectName();
        this.expectPunct(':');
        fields[name] = this.parseValue();
      }
      this.expectPunct('}');
      return { kind: 'object', fields };
    }
    if (token.kind === 'name') {
      this.next();
      if (token.value === 'true') return { kind: 'literal', value: true };
      if (token.value === 'false') return { kind: 'literal', value: false };
      if (token.value === 'null') return { kind: 'literal', value: null };
      return { kind: 'enum', value: token.value };
    }
    this.next();
    return { kind: 'literal', value: null };
  }
}

// ---------------------------------------------------------------- execution

interface TypedValue {
  __gqlType: string;
  __gqlData: unknown;
}

function typed(type: string, data: unknown): TypedValue {
  return { __gqlType: type, __gqlData: data };
}

function isTyped(value: unknown): value is TypedValue {
  return value !== null && typeof value === 'object' && typeof (value as TypedValue).__gqlType === 'string';
}

interface ExecContext {
  store: Store;
  viewer: string;
  variables: Record<string, unknown>;
  fragments: Map<string, FragmentNode>;
}

class GraphQLError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphQLError';
  }
}

function valueOf(node: ValueNode, variables: Record<string, unknown>): unknown {
  switch (node.kind) {
    case 'variable':
      return variables[node.name];
    case 'literal':
      return node.value;
    case 'enum':
      return node.value;
    case 'list':
      return node.values.map((entry) => valueOf(entry, variables));
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(node.fields)) out[key] = valueOf(value, variables);
      return out;
    }
  }
}

function arg(args: Record<string, ValueNode>, name: string, ctx: ExecContext): unknown {
  const node = args[name];
  return node === undefined ? undefined : valueOf(node, ctx.variables);
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function globalId(type: string, id: number): string {
  return Buffer.from(`${type}:${id}`, 'utf8').toString('base64');
}

function parseGlobalId(value: string): { type: string; id: number } | null {
  try {
    const text = Buffer.from(value, 'base64').toString('utf8');
    const at = text.indexOf(':');
    if (at <= 0) return null;
    const type = text.slice(0, at);
    const id = Number(text.slice(at + 1));
    if (!Number.isFinite(id)) return null;
    return { type, id };
  } catch {
    return null;
  }
}

function complete(value: unknown, selection: SelectionNode[], ctx: ExecContext): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map((entry) => complete(entry, selection, ctx));
  if (isTyped(value)) {
    if (selection.length === 0) return value.__gqlData;
    return executeSelectionSet(value.__gqlType, value.__gqlData, selection, ctx);
  }
  return value;
}

function executeSelectionSet(typeName: string, data: unknown, selection: SelectionNode[], ctx: ExecContext): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const node of selection) {
    if (node.kind === 'inline') {
      if (node.typeCondition === null || node.typeCondition === typeName) {
        Object.assign(out, executeSelectionSet(typeName, data, node.selection, ctx));
      }
      continue;
    }
    if (node.kind === 'spread') {
      const fragment = ctx.fragments.get(node.name);
      if (fragment && (fragment.typeCondition === typeName || fragment.typeCondition === 'Node')) {
        Object.assign(out, executeSelectionSet(typeName, data, fragment.selection, ctx));
      }
      continue;
    }
    const key = node.alias ?? node.name;
    const resolved = resolveField(typeName, data, node, ctx);
    out[key] = complete(resolved, node.selection, ctx);
  }
  return out;
}

type Resolver = (data: any, field: FieldNode, ctx: ExecContext) => unknown;

const scalarTypeNames = new Set(['User', 'Ref', 'PageInfo', '__Type', '__Field', '__EnumValue', 'IssueComment', 'PullRequestChangedFile']);

function resolveField(typeName: string, data: any, field: FieldNode, ctx: ExecContext): unknown {
  const resolver = RESOLVERS[typeName]?.[field.name];
  if (resolver === undefined) {
    if (scalarTypeNames.has(typeName) && field.name === 'id' && data && 'id' in data) return data.id;
    throw new GraphQLError(`Cannot query field "${field.name}" on type "${typeName}".`);
  }
  return resolver(data, field, ctx);
}

function repoById(store: Store, id: number): Repo | undefined {
  for (const repo of store.repos.values()) if (repo.id === id) return repo;
  return undefined;
}

function issueById(store: Store, id: number): { repo: Repo; issue: Issue } | undefined {
  for (const [key, issues] of store.issues.entries()) {
    const issue = issues.find((entry) => entry.id === id);
    if (issue) {
      const repo = store.repos.get(key);
      if (repo) return { repo, issue };
    }
  }
  return undefined;
}

function pullById(store: Store, id: number): { repo: Repo; pr: PullRequest } | undefined {
  for (const [key, pulls] of store.pulls.entries()) {
    const pr = pulls.find((entry) => entry.id === id);
    if (pr) {
      const repo = store.repos.get(key);
      if (repo) return { repo, pr };
    }
  }
  return undefined;
}

function commentById(store: Store, id: number): { repo: Repo; issueNumber: number; comment: IssueComment } | undefined {
  for (const [key, byIssue] of store.issueComments.entries()) {
    for (const [issueNumber, comments] of byIssue.entries()) {
      const comment = comments.find((entry) => entry.id === id);
      if (comment) {
        const repo = store.repos.get(key);
        if (repo) return { repo, issueNumber, comment };
      }
    }
  }
  return undefined;
}

function repoNode(repo: Repo): TypedValue {
  return typed('Repository', repo);
}

function issueNode(issue: Issue): TypedValue {
  return typed('Issue', issue);
}

function pullNode(pr: PullRequest): TypedValue {
  return typed('PullRequest', pr);
}

function issueState(issue: Issue): string {
  return issue.state === 'closed' ? 'CLOSED' : 'OPEN';
}

function pullState(pr: PullRequest): string {
  if (pr.merged) return 'MERGED';
  return pr.state === 'closed' ? 'CLOSED' : 'OPEN';
}

function issuesFor(store: Store, repo: Repo): Issue[] {
  return store.issues.get(store.repoKey(repo.owner, repo.name)) || [];
}

function pullsFor(store: Store, repo: Repo): PullRequest[] {
  return store.pulls.get(store.repoKey(repo.owner, repo.name)) || [];
}

function connectionCursor(offset: number): string {
  return Buffer.from(`offset:${offset}`, 'utf8').toString('base64');
}

function cursorOffset(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const text = Buffer.from(cursor, 'base64').toString('utf8');
    const value = Number(text.replace(/^offset:/, ''));
    return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
  } catch {
    return 0;
  }
}

const RESOLVERS: Record<string, Record<string, Resolver>> = {
  Query: {
    viewer(_data, _field, ctx) {
      return typed('User', { login: ctx.viewer });
    },
    repository(_data, field, ctx) {
      const owner = str(arg(field.args, 'owner', ctx));
      const name = str(arg(field.args, 'name', ctx));
      if (!owner || !name || owner !== ctx.viewer) return null;
      const repo = ctx.store.getRepo(owner, name);
      return repo ? repoNode(repo) : null;
    },
    node(_data, field, ctx) {
      const id = str(arg(field.args, 'id', ctx));
      if (!id) return null;
      const parsed = parseGlobalId(id);
      if (!parsed) return null;
      if (parsed.type === 'Repository') {
        const repo = repoById(ctx.store, parsed.id);
        return repo ? repoNode(repo) : null;
      }
      if (parsed.type === 'Issue') {
        const found = issueById(ctx.store, parsed.id);
        return found ? issueNode(found.issue) : null;
      }
      if (parsed.type === 'PullRequest') {
        const found = pullById(ctx.store, parsed.id);
        return found ? pullNode(found.pr) : null;
      }
      if (parsed.type === 'IssueComment') {
        const found = commentById(ctx.store, parsed.id);
        return found ? typed('IssueComment', found.comment) : null;
      }
      return null;
    },
    __type(_data, field, ctx) {
      const name = str(arg(field.args, 'name', ctx));
      if (!name || !TYPE_REGISTRY[name]) return null;
      return typed('__Type', { name });
    },
    __typename() {
      return 'Query';
    },
  },
  Mutation: {
    createIssue(_data, field, ctx) {
      const input = arg(field.args, 'input', ctx);
      if (!input || typeof input !== 'object') throw new GraphQLError('createIssue needs an input object');
      const record = input as Record<string, unknown>;
      const repo = repoById(ctx.store, parseGlobalId(String(record.repositoryId ?? ''))?.id ?? -1);
      if (!repo) throw new GraphQLError('repository not found');
      const title = str(record.title) ?? '';
      const body = str(record.body) ?? '';
      const labels = Array.isArray(record.labels) ? record.labels.filter((entry): entry is string => typeof entry === 'string') : [];
      const created = createIssue(ctx.store, repo, { title, body, labels });
      if (!created.issue) throw new GraphQLError(created.error ?? 'could not create issue');
      return typed('CreateIssuePayload', { issue: issueNode(created.issue) });
    },
    updateIssue(_data, field, ctx) {
      const input = arg(field.args, 'input', ctx);
      const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
      const found = issueById(ctx.store, parseGlobalId(String(record.issueId ?? record.id ?? ''))?.id ?? -1);
      if (!found) throw new GraphQLError('issue not found');
      const state = record.state === 'CLOSED' || record.state === 'closed' ? 'closed' : record.state === 'OPEN' || record.state === 'open' ? 'open' : undefined;
      updateIssue(found.issue, { state, title: str(record.title), body: str(record.body) });
      return typed('UpdateIssuePayload', { issue: issueNode(found.issue) });
    },
    closeIssue(_data, field, ctx) {
      const input = arg(field.args, 'input', ctx);
      const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
      const found = issueById(ctx.store, parseGlobalId(String(record.issueId ?? ''))?.id ?? -1);
      if (!found) throw new GraphQLError('issue not found');
      updateIssue(found.issue, { state: 'closed' });
      return typed('CloseIssuePayload', { issue: issueNode(found.issue) });
    },
    addComment(_data, field, ctx) {
      const input = arg(field.args, 'input', ctx);
      const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
      const subject = parseGlobalId(String(record.subjectId ?? ''));
      const body = str(record.body) ?? '';
      if (!subject) throw new GraphQLError('subject not found');
      let repo: Repo | undefined;
      let issueNumber = 0;
      if (subject.type === 'Issue') {
        const found = issueById(ctx.store, subject.id);
        if (!found) throw new GraphQLError('issue not found');
        repo = found.repo;
        issueNumber = found.issue.number;
      } else if (subject.type === 'PullRequest') {
        const found = pullById(ctx.store, subject.id);
        if (!found) throw new GraphQLError('pull request not found');
        repo = found.repo;
        issueNumber = found.pr.number;
      }
      if (!repo) throw new GraphQLError('subject not found');
      const comment = addIssueComment(ctx.store, repo, issueNumber, body);
      if (!comment) throw new GraphQLError('subject not found');
      return typed('AddCommentPayload', { commentEdge: typed('IssueCommentEdge', { node: typed('IssueComment', comment) }) });
    },
    createPullRequest(_data, field, ctx) {
      const input = arg(field.args, 'input', ctx);
      const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
      const repo = repoById(ctx.store, parseGlobalId(String(record.repositoryId ?? ''))?.id ?? -1);
      if (!repo) throw new GraphQLError('repository not found');
      const head = str(record.headRefName) ?? str(record.head);
      const base = str(record.baseRefName) ?? str(record.base);
      const title = str(record.title) ?? '';
      if (!head || !base) throw new GraphQLError('headRefName and baseRefName are required');
      const created = createPullRequest(ctx.store, repo, { title, body: str(record.body) ?? '', head, base });
      if (!created.pr) throw new GraphQLError(created.error ?? 'could not create pull request');
      return typed('CreatePullRequestPayload', { pullRequest: pullNode(created.pr) });
    },
    mergePullRequest(_data, field, ctx) {
      const input = arg(field.args, 'input', ctx);
      const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
      const found = pullById(ctx.store, parseGlobalId(String(record.pullRequestId ?? ''))?.id ?? -1);
      if (!found) throw new GraphQLError('pull request not found');
      const merged = mergePullRequest(ctx.store, found.repo, found.pr);
      if (!merged.ok) throw new GraphQLError(merged.message);
      return typed('MergePullRequestPayload', { pullRequest: pullNode(found.pr) });
    },
  },
  Repository: {
    id(data: Repo) {
      return globalId('Repository', data.id);
    },
    databaseId(data: Repo) {
      return data.id;
    },
    name(data: Repo) {
      return data.name;
    },
    nameWithOwner(data: Repo) {
      return `${data.owner}/${data.name}`;
    },
    owner(data: Repo) {
      return typed('User', { login: data.owner });
    },
    defaultBranchRef(data: Repo) {
      return typed('Ref', { name: data.defaultBranch });
    },
    viewerPermission() {
      return 'ADMIN';
    },
    hasIssuesEnabled() {
      return true;
    },
    isPrivate(data: Repo) {
      return data.private;
    },
    description(data: Repo) {
      return data.description;
    },
    createdAt(data: Repo) {
      return data.createdAt;
    },
    updatedAt(data: Repo) {
      return data.updatedAt;
    },
    issue(data: Repo, field, ctx) {
      const number = num(arg(field.args, 'number', ctx));
      if (number === undefined) return null;
      const issue = issuesFor(ctx.store, data).find((entry) => entry.number === number);
      return issue ? issueNode(issue) : null;
    },
    issues(data: Repo, field, ctx) {
      let list = issuesFor(ctx.store, data).slice();
      const states = arg(field.args, 'states', ctx);
      if (Array.isArray(states) && states.length > 0) {
        const wanted = new Set(states.map((entry) => String(entry)));
        list = list.filter((issue) => wanted.has(issueState(issue)));
      }
      const orderBy = arg(field.args, 'orderBy', ctx);
      let fieldName = 'CREATED_AT';
      let direction = 'DESC';
      if (orderBy && typeof orderBy === 'object') {
        const record = orderBy as Record<string, unknown>;
        if (typeof record.field === 'string') fieldName = record.field;
        if (typeof record.direction === 'string') direction = record.direction;
      }
      list.sort((a, b) => {
        const av = fieldName === 'UPDATED_AT' ? a.updated_at : a.created_at;
        const bv = fieldName === 'UPDATED_AT' ? b.updated_at : b.created_at;
        const cmp = av < bv ? -1 : av > bv ? 1 : a.number - b.number;
        return direction === 'ASC' ? cmp : -cmp;
      });
      const after = cursorOffset(str(arg(field.args, 'after', ctx)));
      const firstRaw = num(arg(field.args, 'first', ctx));
      const first = firstRaw === undefined ? list.length : Math.max(0, Math.trunc(firstRaw));
      const page = list.slice(after, after + first);
      const end = after + page.length;
      return typed('IssueConnection', {
        nodes: page.map((issue) => issueNode(issue)),
        pageInfo: typed('PageInfo', {
          hasNextPage: end < list.length,
          hasPreviousPage: after > 0,
          endCursor: page.length > 0 ? connectionCursor(end) : null,
          startCursor: page.length > 0 ? connectionCursor(after) : null,
        }),
        totalCount: list.length,
      });
    },
    pullRequests(data: Repo, field, ctx) {
      let list = pullsFor(ctx.store, data).slice();
      const states = arg(field.args, 'states', ctx);
      if (Array.isArray(states) && states.length > 0) {
        const wanted = new Set(states.map((entry) => String(entry)));
        list = list.filter((pr) => wanted.has(pullState(pr)));
      } else {
        list = list.filter((pr) => pullState(pr) === 'OPEN');
      }
      list.sort((a, b) => b.number - a.number);
      const firstRaw = num(arg(field.args, 'first', ctx));
      const first = firstRaw === undefined ? list.length : Math.max(0, Math.trunc(firstRaw));
      const page = list.slice(0, first);
      return typed('PullRequestConnection', {
        nodes: page.map((pr) => pullNode(pr)),
        totalCount: list.length,
      });
    },
    pullRequest(data: Repo, field, ctx) {
      const number = num(arg(field.args, 'number', ctx));
      if (number === undefined) return null;
      const pr = findPullRequest(ctx.store, data, number);
      return pr ? pullNode(pr) : null;
    },
  },
  Issue: {
    id(data: Issue) {
      return globalId('Issue', data.id);
    },
    number(data: Issue) {
      return data.number;
    },
    title(data: Issue) {
      return data.title;
    },
    state(data: Issue) {
      return issueState(data);
    },
    body(data: Issue) {
      return data.body;
    },
    createdAt(data: Issue) {
      return data.created_at;
    },
    updatedAt(data: Issue) {
      return data.updated_at;
    },
    closedAt(data: Issue) {
      return data.closed_at ?? null;
    },
    labels(data: Issue) {
      return typed('LabelConnection', {
        nodes: data.labels.map((label) => typed('Label', { name: label.name, color: label.color })),
      });
    },
    comments(data: Issue, _field, ctx) {
      const found = issueById(ctx.store, data.id);
      if (!found) return typed('IssueCommentConnection', { nodes: [] });
      return typed('IssueCommentConnection', {
        nodes: listComments(ctx.store, found.repo, data.number).map((comment) => typed('IssueComment', comment)),
      });
    },
  },
  PullRequest: {
    id(data: PullRequest) {
      return globalId('PullRequest', data.id);
    },
    number(data: PullRequest) {
      return data.number;
    },
    title(data: PullRequest) {
      return data.title;
    },
    body(data: PullRequest) {
      return data.body;
    },
    state(data: PullRequest) {
      return pullState(data);
    },
    merged(data: PullRequest) {
      return data.merged;
    },
    headRefName(data: PullRequest) {
      return data.head.ref;
    },
    baseRefName(data: PullRequest) {
      return data.base.ref;
    },
    headRefOid(data: PullRequest) {
      return data.head.sha;
    },
    baseRefOid(data: PullRequest) {
      return data.base.sha;
    },
    mergeable(data: PullRequest) {
      return data.merged || data.state === 'closed' ? 'UNKNOWN' : 'MERGEABLE';
    },
    mergeableState(data: PullRequest) {
      return data.merged || data.state === 'closed' ? 'UNKNOWN' : 'MERGEABLE';
    },
    isDraft() {
      return false;
    },
    mergedAt(data: PullRequest) {
      return data.merged_at ?? null;
    },
    createdAt(data: PullRequest) {
      return data.created_at;
    },
    updatedAt(data: PullRequest) {
      return data.updated_at;
    },
    files(data: PullRequest, field, ctx) {
      const firstRaw = num(arg(field.args, 'first', ctx));
      const first = firstRaw === undefined ? data.files.length : Math.max(0, Math.trunc(firstRaw));
      const files = data.files.slice(0, first);
      return typed('PullRequestChangedFileConnection', {
        nodes: files.map((file) =>
          typed('PullRequestChangedFile', {
            path: file.filename,
            additions: file.additions,
            deletions: file.deletions,
            changeType: file.status === 'added' ? 'ADDED' : file.status === 'removed' ? 'DELETED' : 'MODIFIED',
          }),
        ),
        totalCount: data.files.length,
      });
    },
  },
  User: {
    login(data: { login: string }) {
      return data.login;
    },
    id(data: { login: string }) {
      return Buffer.from(`User:${data.login}`, 'utf8').toString('base64');
    },
    name(data: { login: string }) {
      return data.login;
    },
  },
  Ref: {
    name(data: { name: string }) {
      return data.name;
    },
  },
  PageInfo: {
    hasNextPage(data: { hasNextPage: boolean }) {
      return data.hasNextPage;
    },
    hasPreviousPage(data: { hasPreviousPage: boolean }) {
      return data.hasPreviousPage;
    },
    endCursor(data: { endCursor: string | null }) {
      return data.endCursor;
    },
    startCursor(data: { startCursor: string | null }) {
      return data.startCursor;
    },
  },
  IssueConnection: {
    nodes(data: { nodes?: unknown[] }) {
      return data.nodes ?? [];
    },
    pageInfo(data: { pageInfo?: unknown }) {
      return data.pageInfo ?? null;
    },
    totalCount(data: { totalCount?: number }) {
      return data.totalCount ?? 0;
    },
  },
  PullRequestConnection: {
    nodes(data: { nodes?: unknown[] }) {
      return data.nodes ?? [];
    },
    pageInfo(data: { pageInfo?: unknown }) {
      return data.pageInfo ?? null;
    },
    totalCount(data: { totalCount?: number }) {
      return data.totalCount ?? 0;
    },
  },
  IssueCommentConnection: {
    nodes(data: { nodes?: unknown[] }) {
      return data.nodes ?? [];
    },
    pageInfo(data: { pageInfo?: unknown }) {
      return data.pageInfo ?? null;
    },
    totalCount(data: { totalCount?: number }) {
      return data.totalCount ?? 0;
    },
  },
  IssueCommentEdge: {
    node(data: { node?: unknown }) {
      return data.node ?? null;
    },
  },
  LabelConnection: {
    nodes(data: { nodes?: unknown[] }) {
      return data.nodes ?? [];
    },
  },
  PullRequestChangedFileConnection: {
    nodes(data: { nodes?: unknown[] }) {
      return data.nodes ?? [];
    },
    totalCount(data: { totalCount?: number }) {
      return data.totalCount ?? 0;
    },
  },
  CreateIssuePayload: {
    issue(data: { issue?: unknown }) {
      return data.issue ?? null;
    },
  },
  UpdateIssuePayload: {
    issue(data: { issue?: unknown }) {
      return data.issue ?? null;
    },
  },
  CloseIssuePayload: {
    issue(data: { issue?: unknown }) {
      return data.issue ?? null;
    },
  },
  AddCommentPayload: {
    commentEdge(data: { commentEdge?: unknown }) {
      return data.commentEdge ?? null;
    },
  },
  CreatePullRequestPayload: {
    pullRequest(data: { pullRequest?: unknown }) {
      return data.pullRequest ?? null;
    },
  },
  MergePullRequestPayload: {
    pullRequest(data: { pullRequest?: unknown }) {
      return data.pullRequest ?? null;
    },
  },
  IssueComment: {
    id(data: IssueComment) {
      return globalId('IssueComment', data.id);
    },
    body(data: IssueComment) {
      return data.body;
    },
    createdAt(data: IssueComment) {
      return data.created_at;
    },
    updatedAt(data: IssueComment) {
      return data.updated_at;
    },
  },
  Label: {
    name(data: { name: string }) {
      return data.name;
    },
    color(data: { color: string }) {
      return data.color;
    },
  },
  PullRequestChangedFile: {
    path(data: { path: string }) {
      return data.path;
    },
    additions(data: { additions: number }) {
      return data.additions;
    },
    deletions(data: { deletions: number }) {
      return data.deletions;
    },
    changeType(data: { changeType: string }) {
      return data.changeType;
    },
  },
  '__Type': {
    name(data: { name: string }) {
      return data.name;
    },
    kind(data: { name: string }) {
      return TYPE_REGISTRY[data.name]?.kind ?? 'OBJECT';
    },
    fields(data: { name: string }) {
      const type = TYPE_REGISTRY[data.name];
      if (!type || !type.fields) return null;
      return type.fields.map((name) => typed('__Field', { name }));
    },
    enumValues(data: { name: string }) {
      const type = TYPE_REGISTRY[data.name];
      if (!type || !type.enumValues) return null;
      return type.enumValues.map((name) => typed('__EnumValue', { name }));
    },
  },
  '__Field': {
    name(data: { name: string }) {
      return data.name;
    },
  },
  '__EnumValue': {
    name(data: { name: string }) {
      return data.name;
    },
  },
};

interface TypeDescription {
  kind: string;
  fields?: string[];
  enumValues?: string[];
}

const TYPE_REGISTRY: Record<string, TypeDescription> = {
  Issue: {
    kind: 'OBJECT',
    fields: ['id', 'number', 'title', 'state', 'body', 'createdAt', 'updatedAt', 'closedAt', 'labels', 'comments'],
  },
  PullRequest: {
    kind: 'OBJECT',
    fields: [
      'id', 'number', 'title', 'body', 'state', 'merged', 'headRefName', 'baseRefName',
      'headRefOid', 'baseRefOid', 'mergeable', 'mergeableState', 'files', 'isDraft',
      'mergedAt', 'createdAt', 'updatedAt',
    ],
  },
  Repository: {
    kind: 'OBJECT',
    fields: [
      'id', 'databaseId', 'name', 'nameWithOwner', 'owner', 'defaultBranchRef',
      'viewerPermission', 'hasIssuesEnabled', 'issue', 'issues', 'pullRequests',
      'pullRequest', 'description', 'isPrivate', 'createdAt', 'updatedAt',
    ],
  },
  User: { kind: 'OBJECT', fields: ['id', 'login', 'name'] },
  Ref: { kind: 'OBJECT', fields: ['name'] },
  PageInfo: { kind: 'OBJECT', fields: ['hasNextPage', 'hasPreviousPage', 'startCursor', 'endCursor'] },
  IssueConnection: { kind: 'OBJECT', fields: ['nodes', 'pageInfo', 'totalCount'] },
  PullRequestConnection: { kind: 'OBJECT', fields: ['nodes', 'pageInfo', 'totalCount'] },
  IssueCommentConnection: { kind: 'OBJECT', fields: ['nodes', 'pageInfo', 'totalCount'] },
  IssueCommentEdge: { kind: 'OBJECT', fields: ['node'] },
  LabelConnection: { kind: 'OBJECT', fields: ['nodes'] },
  PullRequestChangedFileConnection: { kind: 'OBJECT', fields: ['nodes', 'totalCount'] },
  PullRequestChangedFile: { kind: 'OBJECT', fields: ['path', 'additions', 'deletions', 'changeType'] },
  IssueComment: { kind: 'OBJECT', fields: ['id', 'body', 'createdAt', 'updatedAt'] },
  CreateIssuePayload: { kind: 'OBJECT', fields: ['issue'] },
  UpdateIssuePayload: { kind: 'OBJECT', fields: ['issue'] },
  CloseIssuePayload: { kind: 'OBJECT', fields: ['issue'] },
  AddCommentPayload: { kind: 'OBJECT', fields: ['commentEdge'] },
  CreatePullRequestPayload: { kind: 'OBJECT', fields: ['pullRequest'] },
  MergePullRequestPayload: { kind: 'OBJECT', fields: ['pullRequest'] },
  SearchType: { kind: 'ENUM', enumValues: ['ISSUE', 'REPOSITORY', 'USER', 'DISCUSSION'] },
  IssueState: { kind: 'ENUM', enumValues: ['OPEN', 'CLOSED'] },
  PullRequestState: { kind: 'ENUM', enumValues: ['OPEN', 'CLOSED', 'MERGED'] },
  MergeableState: { kind: 'ENUM', enumValues: ['MERGEABLE', 'CONFLICTING', 'UNKNOWN'] },
  PullRequestMergeMethod: { kind: 'ENUM', enumValues: ['MERGE', 'SQUASH', 'REBASE'] },
  RepositoryPermission: { kind: 'ENUM', enumValues: ['ADMIN', 'MAINTAIN', 'WRITE', 'TRIAGE', 'READ'] },
  IssueOrderField: { kind: 'ENUM', enumValues: ['CREATED_AT', 'UPDATED_AT', 'COMMENTS'] },
  OrderDirection: { kind: 'ENUM', enumValues: ['ASC', 'DESC'] },
};

// ---------------------------------------------------------------- public entry points

export interface GraphQLRequest {
  query: unknown;
  variables?: unknown;
  operationName?: unknown;
}

export function executeGraphQL(store: Store, viewer: string, request: GraphQLRequest): { data?: unknown; errors?: Array<{ message: string }> } {
  if (typeof request.query !== 'string') {
    return { errors: [{ message: 'query must be a string' }] };
  }
  const variables = request.variables && typeof request.variables === 'object' && !Array.isArray(request.variables)
    ? (request.variables as Record<string, unknown>)
    : {};
  try {
    const parsed = new Parser(request.query).parseDocument();
    const operationName = typeof request.operationName === 'string' ? request.operationName : null;
    const operation = operationName
      ? parsed.operations.find((entry) => entry.name === operationName)
      : parsed.operations[0];
    if (!operation) return { errors: [{ message: `Unknown operation named "${operationName}".` }] };
    const ctx: ExecContext = { store, viewer, variables, fragments: parsed.fragments };
    if (operation.operation === 'mutation') {
      const data = executeSelectionSet('Mutation', {}, operation.selection, ctx);
      return { data };
    }
    const data = executeSelectionSet('Query', {}, operation.selection, ctx);
    return { data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, errors: [{ message }] };
  }
}

/** Execute one HTTP body (a single operation object or GitHub's array form). */
export function executeGraphQLBody(store: Store, viewer: string, body: unknown): unknown {
  if (Array.isArray(body)) {
    return body.map((entry) => {
      if (!entry || typeof entry !== 'object') return { data: null, errors: [{ message: 'invalid operation' }] };
      return executeGraphQL(store, viewer, entry as GraphQLRequest);
    });
  }
  if (!body || typeof body !== 'object') return { data: null, errors: [{ message: 'invalid request body' }] };
  return executeGraphQL(store, viewer, body as GraphQLRequest);
}
