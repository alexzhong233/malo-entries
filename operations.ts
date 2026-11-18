// Shared forge operations used by GraphQL and MCP (and modelled on the REST routes in app.ts).
// Keeping them here means every surface reads and writes the same in-memory store.

import { buildCommit, parseTree, type TreeEntry } from './gitutil.ts';
import type { Issue, IssueComment, Label, PRFile, PullRequest, Repo, Store } from './store.ts';

export function repoToJson(repo: Repo) {
  return {
    id: repo.id,
    node_id: Buffer.from(`Repository:${repo.id}`).toString('base64'),
    name: repo.name,
    full_name: `${repo.owner}/${repo.name}`,
    private: repo.private,
    description: repo.description ?? '',
    default_branch: repo.defaultBranch,
    owner: { login: repo.owner },
    html_url: `http://forge.local/${repo.owner}/${repo.name}`,
    created_at: repo.createdAt,
    updated_at: repo.updatedAt,
  };
}

function repoKey(store: Store, repo: Repo): string {
  return store.repoKey(repo.owner, repo.name);
}

export function createIssue(
  store: Store,
  repo: Repo,
  input: { title: string; body?: string; labels?: string[] },
): { issue?: Issue; error?: string } {
  const rk = repoKey(store, repo);
  const labels: Label[] = [];
  const lm = store.labels.get(rk) || new Map<string, Label>();
  for (const name of input.labels ?? []) {
    const label = lm.get(name);
    if (!label) return { error: `label ${name} does not exist` };
    labels.push(label);
  }
  if (!store.issues.has(rk)) store.issues.set(rk, []);
  const list = store.issues.get(rk)!;
  const number = store.nextIssueNumber.get(rk) || 1;
  store.nextIssueNumber.set(rk, number + 1);
  const now = new Date().toISOString();
  const issue: Issue = {
    id: store.nextIssueId++,
    number,
    title: input.title,
    body: input.body ?? '',
    state: 'open',
    labels,
    created_at: now,
    updated_at: now,
    closed_at: null,
  };
  list.push(issue);
  store.indexIssue(rk, issue);
  return { issue };
}

export function findIssue(store: Store, repo: Repo, number: number): Issue | undefined {
  return store.getIssue(repo, number);
}

export function updateIssue(
  issue: Issue,
  patch: { state?: 'open' | 'closed'; title?: string; body?: string },
): Issue {
  if (patch.state !== undefined) {
    issue.state = patch.state;
    issue.closed_at = patch.state === 'closed' ? new Date().toISOString() : null;
  }
  if (patch.title !== undefined) issue.title = patch.title;
  if (patch.body !== undefined) issue.body = patch.body;
  issue.updated_at = new Date().toISOString();
  issue._json = undefined;
  return issue;
}

export function addIssueComment(store: Store, repo: Repo, issueNumber: number, body: string): IssueComment | null {
  if (!findIssue(store, repo, issueNumber)) return null;
  const rk = repoKey(store, repo);
  if (!store.issueComments.has(rk)) store.issueComments.set(rk, new Map());
  const byIssue = store.issueComments.get(rk)!;
  if (!byIssue.has(issueNumber)) byIssue.set(issueNumber, []);
  const now = new Date().toISOString();
  const comment: IssueComment = { id: store.nextCommentId++, body, created_at: now, updated_at: now };
  byIssue.get(issueNumber)!.push(comment);
  return comment;
}

export function listComments(store: Store, repo: Repo, issueNumber: number): IssueComment[] {
  return (store.issueComments.get(repoKey(store, repo)) || new Map()).get(issueNumber) || [];
}

interface FlatFile {
  path: string;
  sha: string;
}

function flattenTree(store: Store, repo: Repo, treeOid: string, prefix: string, out: FlatFile[]): void {
  const obj = store.getObject(repo, treeOid);
  if (!obj || obj.type !== 'tree') return;
  let i = 0;
  const buf = obj.data;
  while (i < buf.length) {
    const sp = buf.indexOf(0x20, i);
    if (sp < 0) break;
    const nul = buf.indexOf(0x00, sp);
    if (nul < 0) break;
    const mode = buf.subarray(i, sp).toString('ascii');
    const name = buf.subarray(sp + 1, nul).toString('utf8');
    const oid = buf.subarray(nul + 1, nul + 21).toString('hex');
    i = nul + 21;
    const path = prefix ? `${prefix}/${name}` : name;
    if (mode === '40000') flattenTree(store, repo, oid, path, out);
    else out.push({ path, sha: oid });
  }
}

export function changedFiles(store: Store, repo: Repo, baseSha: string | undefined, headSha: string | undefined): PRFile[] {
  if (!baseSha || !headSha) return [];
  const baseTree = store.getCommitTreeOid(repo, baseSha);
  const headTree = store.getCommitTreeOid(repo, headSha);
  if (!baseTree || !headTree) return [];
  const baseFiles: FlatFile[] = [];
  const headFiles: FlatFile[] = [];
  flattenTree(store, repo, baseTree, '', baseFiles);
  flattenTree(store, repo, headTree, '', headFiles);
  const baseByPath = new Map(baseFiles.map((file) => [file.path, file.sha]));
  const headByPath = new Map(headFiles.map((file) => [file.path, file.sha]));
  const files: PRFile[] = [];
  for (const file of headFiles) {
    const before = baseByPath.get(file.path);
    if (before !== file.sha) {
      files.push({
        filename: file.path,
        status: before === undefined ? 'added' : 'modified',
        additions: 1,
        deletions: 0,
        changes: 1,
      });
    }
  }
  for (const file of baseFiles) {
    if (!headByPath.has(file.path)) {
      files.push({ filename: file.path, status: 'removed', additions: 0, deletions: 1, changes: 1 });
    }
  }
  return files;
}

function refName(branch: string): string {
  return branch.startsWith('refs/') ? branch : `refs/heads/${branch}`;
}

export function createPullRequest(
  store: Store,
  repo: Repo,
  input: { title: string; body?: string; head: string; base: string },
): { pr?: PullRequest; error?: string } {
  const headSha = store.getRef(repo, refName(input.head));
  const baseSha = store.getRef(repo, refName(input.base));
  if (!headSha || !baseSha) return { error: 'head or base branch does not exist' };
  const rk = repoKey(store, repo);
  if (!store.pulls.has(rk)) store.pulls.set(rk, []);
  const pulls = store.pulls.get(rk)!;
  const number = store.nextPullNumber.get(rk) || 1;
  store.nextPullNumber.set(rk, number + 1);
  const now = new Date().toISOString();
  const pr: PullRequest = {
    id: store.nextPullId++,
    number,
    title: input.title,
    body: input.body ?? '',
    state: 'open',
    merged: false,
    merged_at: null,
    merge_commit_sha: null,
    head: { ref: input.head.replace(/^refs\/heads\//, ''), sha: headSha },
    base: { ref: input.base.replace(/^refs\/heads\//, ''), sha: baseSha },
    files: changedFiles(store, repo, baseSha, headSha),
    created_at: now,
    updated_at: now,
  };
  pulls.push(pr);
  return { pr };
}

export function findPullRequest(store: Store, repo: Repo, number: number): PullRequest | undefined {
  return (store.pulls.get(repoKey(store, repo)) || []).find((pr) => pr.number === number);
}

export function mergePullRequest(
  store: Store,
  repo: Repo,
  pr: PullRequest,
): { ok: boolean; sha?: string; message: string; status?: number } {
  if (pr.merged) return { ok: true, sha: pr.merge_commit_sha ?? undefined, message: 'Pull Request already merged' };
  if (pr.state === 'closed') return { ok: false, message: 'Pull Request is closed', status: 405 };
  const baseRef = refName(pr.base.ref);
  const currentBaseSha = store.getRef(repo, baseRef) || '';
  if (pr.base.sha !== currentBaseSha) {
    return { ok: false, message: 'Pull Request is not mergeable', status: 405 };
  }
  const headTreeOid = store.getCommitTreeOid(repo, pr.head.sha);
  if (!headTreeOid || !currentBaseSha) {
    return { ok: false, message: 'Pull Request is not mergeable', status: 405 };
  }
  const mergeMessage = `Merge pull request #${pr.number} from ${pr.head.ref}`;
  const commit = buildCommit({ tree: headTreeOid, parents: [currentBaseSha], message: mergeMessage });
  const mergeCommitOid = store.putObject(repo, 'commit', commit);
  store.updateRef(repo, baseRef, mergeCommitOid);
  pr.state = 'closed';
  pr.merged = true;
  pr.merged_at = new Date().toISOString();
  pr.merge_commit_sha = mergeCommitOid;
  pr.updated_at = new Date().toISOString();
  return { ok: true, sha: mergeCommitOid, message: 'Pull Request successfully merged' };
}

/** Parse a commit object's headers and message (for REST/graphql commit reads). */
export function commitInfo(data: Buffer): {
  tree: string;
  parents: string[];
  author: { name: string; email: string; date: string };
  committer: { name: string; email: string; date: string };
  message: string;
} {
  const text = data.toString('utf8');
  const split = text.indexOf('\n\n');
  const headers = split >= 0 ? text.slice(0, split) : text;
  const message = (split >= 0 ? text.slice(split + 2) : '').replace(/\n+$/, '');
  let tree = '';
  const parents: string[] = [];
  let author = { name: '', email: '', date: '' };
  let committer = { name: '', email: '', date: '' };
  for (const line of headers.split('\n')) {
    if (line.startsWith('tree ')) tree = line.slice(5).trim();
    else if (line.startsWith('parent ')) parents.push(line.slice(7).trim());
    else if (line.startsWith('author ')) author = identity(line.slice(7));
    else if (line.startsWith('committer ')) committer = identity(line.slice(10));
  }
  return { tree, parents, author, committer, message };
}

function identity(text: string): { name: string; email: string; date: string } {
  const match = /^(.*?) <(.*?)> (.*)$/.exec(text);
  if (!match) return { name: text, email: '', date: '' };
  return { name: match[1] ?? '', email: match[2] ?? '', date: match[3] ?? '' };
}

/** The tree entries of a commit, for commit-shape helpers. */
export function commitTreeEntries(store: Store, repo: Repo, commitOid: string): TreeEntry[] {
  const treeOid = store.getCommitTreeOid(repo, commitOid);
  if (!treeOid) return [];
  const obj = store.getObject(repo, treeOid);
  if (!obj || obj.type !== 'tree') return [];
  return parseTree(obj.data);
}
