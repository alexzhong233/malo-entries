// Model Context Protocol endpoint: a compact JSON-RPC 2.0 server over Streamable HTTP.
// It serves the modern 2026-07-28 discovery flow and the legacy initialize handshake.

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Store } from './store.ts';
import {
  createIssue,
  createPullRequest,
  findPullRequest,
  mergePullRequest,
  repoToJson,
} from './operations.ts';

const SERVER_INFO = { name: 'makefun-github-core', version: '1.0.0' };
const SUPPORTED_VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberArg(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return undefined;
}

function tool(name: string, description: string, properties: JsonObject, required: string[]) {
  return {
    name,
    title: name,
    description,
    inputSchema: { type: 'object', properties, required, additionalProperties: false },
  };
}

const REPO_PROPERTIES: JsonObject = {
  owner: { type: 'string', description: 'Repository owner login' },
  repo: { type: 'string', description: 'Repository name' },
};

const TOOLS = Object.freeze([
  tool('create_repo', 'Create a repository owned by the authenticated viewer.', {
    name: { type: 'string', description: 'Repository name' },
    description: { type: 'string', description: 'Repository description' },
    private: { type: 'boolean', description: 'Whether the repository is private' },
  }, ['name']),
  tool('get_repo', 'Read one repository by its owner and name.', {
    ...REPO_PROPERTIES,
    full_name: { type: 'string', description: 'owner/repo, an alternative to owner and repo' },
  }, ['owner', 'repo']),
  tool('create_issue', 'Create an issue in a repository.', {
    ...REPO_PROPERTIES,
    title: { type: 'string', description: 'Issue title' },
    body: { type: 'string', description: 'Issue body' },
    full_name: { type: 'string', description: 'owner/repo, an alternative to owner and repo' },
  }, ['owner', 'repo', 'title']),
  tool('list_issues', 'List issues in a repository, optionally filtered by state.', {
    ...REPO_PROPERTIES,
    state: { type: 'string', description: 'open, closed or all' },
    full_name: { type: 'string', description: 'owner/repo, an alternative to owner and repo' },
  }, ['owner', 'repo']),
  tool('create_pull_request', 'Open a pull request from a head branch into a base branch.', {
    ...REPO_PROPERTIES,
    title: { type: 'string', description: 'Pull request title' },
    body: { type: 'string', description: 'Pull request body' },
    head: { type: 'string', description: 'Head branch name' },
    base: { type: 'string', description: 'Base branch name' },
    full_name: { type: 'string', description: 'owner/repo, an alternative to owner and repo' },
  }, ['owner', 'repo', 'title', 'head', 'base']),
  tool('merge_pull_request', 'Merge an open pull request.', {
    ...REPO_PROPERTIES,
    pull_number: { type: 'number', description: 'Pull request number' },
    full_name: { type: 'string', description: 'owner/repo, an alternative to owner and repo' },
  }, ['owner', 'repo', 'pull_number']),
]);

const TOOL_BY_NORMALIZED = new Map<string, string>();
for (const definition of TOOLS) {
  TOOL_BY_NORMALIZED.set(normalize(definition.name), definition.name);
  TOOL_BY_NORMALIZED.set(`github${normalize(definition.name)}`, definition.name);
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function canonicalToolName(name: string): string | null {
  const wanted = normalize(name);
  const exact = TOOL_BY_NORMALIZED.get(wanted);
  if (exact) return exact;
  for (const [normalized, canonical] of TOOL_BY_NORMALIZED.entries()) {
    if (wanted.length > normalized.length && wanted.endsWith(normalized)) return canonical;
  }
  return null;
}

function resolveRepo(store: Store, viewer: string, args: JsonObject): { owner: string; repo: string } | { error: string } {
  const fullName = text(args.full_name);
  let owner = text(args.owner);
  let repo = text(args.repo);
  if ((!owner || !repo) && fullName.includes('/')) {
    const [first, ...rest] = fullName.split('/');
    owner = first ?? '';
    repo = rest.join('/');
  }
  if (!owner || !repo) return { error: 'owner and repo are required' };
  if (owner !== viewer) return { error: 'repository not found' };
  if (!store.getRepo(owner, repo)) return { error: 'repository not found' };
  return { owner, repo };
}

function callResult(payload: unknown) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    structuredContent: payload,
    isError: false,
  };
}

function callError(message: string) {
  return {
    content: [{ type: 'text', text: message }],
    structuredContent: { error: message },
    isError: true,
  };
}

function issueJson(issue: { id: number; number: number; title: string; body: string; state: string; labels: unknown[]; created_at: string; updated_at: string }) {
  return {
    id: issue.id,
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    labels: issue.labels,
    created_at: issue.created_at,
    updated_at: issue.updated_at,
  };
}

function pullJson(pr: { id: number; number: number; title: string; body: string; state: string; merged: boolean; merged_at?: string | null; merge_commit_sha?: string | null; head: unknown; base: unknown; files: unknown[]; created_at: string; updated_at: string }) {
  return {
    id: pr.id,
    number: pr.number,
    title: pr.title,
    body: pr.body,
    state: pr.state,
    merged: pr.merged,
    merged_at: pr.merged_at ?? null,
    merge_commit_sha: pr.merge_commit_sha ?? null,
    head: pr.head,
    base: pr.base,
    files: pr.files,
    created_at: pr.created_at,
    updated_at: pr.updated_at,
  };
}

function callTool(store: Store, viewer: string, name: string, args: JsonObject): { result?: unknown; errorCode?: number; errorMessage?: string } {
  const canonical = canonicalToolName(name);
  if (!canonical) return { errorCode: -32602, errorMessage: `Unknown tool: ${name}` };

  if (canonical === 'create_repo') {
    const repoName = text(args.name);
    if (!repoName) return { errorCode: -32602, errorMessage: 'name is required' };
    let repo = store.getRepo(viewer, repoName);
    if (!repo) {
      const created = store.createRepo(viewer, repoName, text(args.description), args.private === true, false);
      if (!created) return { result: callError('repository creation failed') };
      repo = created.repo;
    }
    return { result: callResult(repoToJson(repo)) };
  }

  const resolved = resolveRepo(store, viewer, args);
  if ('error' in resolved) return { result: callError(resolved.error) };
  const repo = store.getRepo(resolved.owner, resolved.repo)!;
  const repoKey = store.repoKey(resolved.owner, resolved.repo);

  if (canonical === 'get_repo') {
    return { result: callResult(repoToJson(repo)) };
  }

  if (canonical === 'create_issue') {
    const title = text(args.title);
    if (!title) return { errorCode: -32602, errorMessage: 'title is required' };
    const created = createIssue(store, repo, { title, body: text(args.body) });
    if (!created.issue) return { result: callError(created.error ?? 'could not create issue') };
    return { result: callResult(issueJson(created.issue)) };
  }

  if (canonical === 'list_issues') {
    const wanted = text(args.state).toLowerCase();
    let issues = (store.issues.get(repoKey) || []).slice();
    if (wanted === 'open' || wanted === 'closed') issues = issues.filter((issue) => issue.state === wanted);
    const payload = { total_count: issues.length, issues: issues.map(issueJson) };
    return { result: callResult(payload) };
  }

  if (canonical === 'create_pull_request') {
    const title = text(args.title);
    const head = text(args.head);
    const base = text(args.base);
    if (!title || !head || !base) return { errorCode: -32602, errorMessage: 'title, head and base are required' };
    const created = createPullRequest(store, repo, { title, body: text(args.body), head, base });
    if (!created.pr) return { result: callError(created.error ?? 'could not create pull request') };
    return { result: callResult(pullJson(created.pr)) };
  }

  if (canonical === 'merge_pull_request') {
    const number = numberArg(args.pull_number) ?? numberArg(args.number);
    if (number === undefined) return { errorCode: -32602, errorMessage: 'pull_number is required' };
    const pr = findPullRequest(store, repo, number);
    if (!pr) return { result: callError('pull request not found') };
    const merged = mergePullRequest(store, repo, pr);
    if (!merged.ok) return { result: callError(merged.message) };
    return { result: callResult(pullJson(pr)) };
  }

  return { errorCode: -32602, errorMessage: `Unknown tool: ${name}` };
}

function response(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function errorResponse(id: unknown, code: number, message: string, data?: unknown) {
  const error: JsonObject = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', id: id ?? null, error };
}

function handleRpc(store: Store, viewer: string, message: JsonObject): JsonObject | null {
  const id = message.id;
  const method = text(message.method);
  const params = isObject(message.params) ? message.params : {};

  if (message.jsonrpc !== '2.0' || method === '') {
    return errorResponse(id, -32600, 'Invalid Request');
  }

  switch (method) {
    case 'server/discover': {
      return response(id, {
        resultType: 'complete',
        supportedVersions: SUPPORTED_VERSIONS,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: 'GitHub-compatible repositories, issues and pull requests.',
        _meta: { 'io.modelcontextprotocol/serverInfo': SERVER_INFO },
      });
    }
    case 'initialize': {
      const requested = text(params.protocolVersion);
      const protocolVersion = SUPPORTED_VERSIONS.includes(requested) ? requested : '2025-11-25';
      return response(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        _meta: { 'io.modelcontextprotocol/serverInfo': SERVER_INFO },
      });
    }
    case 'notifications/initialized':
      return null;
    case 'ping':
      return response(id, {});
    case 'tools/list':
      return response(id, { tools: TOOLS });
    case 'tools/call': {
      const name = text(params.name);
      const args = isObject(params.arguments) ? params.arguments : {};
      const called = callTool(store, viewer, name, args);
      if (called.errorCode !== undefined) return errorResponse(id, called.errorCode, called.errorMessage ?? 'Invalid params');
      return response(id, called.result);
    }
    case 'resources/list':
      return response(id, { resources: [] });
    case 'prompts/list':
      return response(id, { prompts: [] });
    default:
      return errorResponse(id, -32601, `Method not found: ${method}`);
  }
}

function jsonContentType(res: ServerResponse): void {
  res.setHeader('content-type', 'application/json; charset=utf-8');
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Handle one /mcp request. Authentication is enforced by app.ts before this runs. */
export async function handleMcpRequest(store: Store, viewer: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = (req.method ?? 'GET').toUpperCase();
  jsonContentType(res);
  if (method === 'DELETE') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (method === 'GET') {
    res.statusCode = 405;
    res.end(JSON.stringify(errorResponse(null, -32601, 'Use POST for MCP requests')));
    return;
  }
  if (method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify(errorResponse(null, -32601, 'Method not allowed')));
    return;
  }
  let textBody: string;
  try {
    textBody = (await readBody(req)).toString('utf8');
  } catch {
    res.statusCode = 400;
    res.end(JSON.stringify(errorResponse(null, -32700, 'Parse error')));
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(textBody);
  } catch {
    res.statusCode = 400;
    res.end(JSON.stringify(errorResponse(null, -32700, 'Parse error')));
    return;
  }

  if (Array.isArray(parsed)) {
    const answers: unknown[] = [];
    for (const entry of parsed) {
      if (!isObject(entry)) answers.push(errorResponse(null, -32600, 'Invalid Request'));
      else {
        const answer = handleRpc(store, viewer, entry);
        if (answer !== null) answers.push(answer);
      }
    }
    res.statusCode = answers.length === 0 ? 202 : 200;
    res.end(answers.length === 0 ? '' : JSON.stringify(answers));
    return;
  }

  if (!isObject(parsed)) {
    res.statusCode = 400;
    res.end(JSON.stringify(errorResponse(null, -32600, 'Invalid Request')));
    return;
  }

  const answer = handleRpc(store, viewer, parsed);
  if (answer === null) {
    res.statusCode = 202;
    res.end();
    return;
  }
  res.statusCode = 200;
  res.end(JSON.stringify(answer));
}
