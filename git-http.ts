import type { IncomingMessage, ServerResponse } from 'node:http';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { Store, type Repo, parseCommitParents, parseCommitFull, parseTagTarget } from './store.ts';
import { decodePktLines, encodePktLines, pktLine, pktFlush, pktDelim, writePack, parsePack, ZERO_OID, isOid, type GitObject, buildCommit } from './gitutil.ts';

function logGitError(context: string, err: unknown, extra?: Record<string, unknown>) {
  console.error(`[git-http] ${context}`, extra ?? '', err);
  if (err instanceof Error && err.stack) console.error(err.stack);
}

function pkt(s: string | Buffer) { return pktLine(typeof s === 'string' ? Buffer.from(s) : s); }

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, headers: Record<string, string>, body?: Buffer | string) {
  const buf = body === undefined ? undefined : (typeof body === 'string' ? Buffer.from(body) : body);
  const h = { ...headers };
  if (buf) h['content-length'] = String(buf.length);
  res.writeHead(status, h);
  res.end(buf);
}

function send404(res: ServerResponse) {
  send(res, 404, { 'content-type': 'text/plain' }, 'Not Found');
}

function getRefAdvertisementLines(store: Store, repo: Repo, service: 'git-upload-pack' | 'git-receive-pack'): { refs: Array<{ oid: string; name: string }>; headSymref: string | null } {
  const refs = store.allRefs(repo);
  const headSymref = repo.head;
  return { refs, headSymref };
}

function uploadPackCapabilitiesV2(): string[] {
  return [
    'version 2',
    'agent=forge/0.1',
    'ls-refs=unborn',
    'fetch=shallow wait-for-done',
    'server-option',
    'object-format=sha1',
  ];
}

function receivePackCapabilities(repo: Repo): string {
  // capabilities on first ref line
  const caps = ['report-status', 'report-status-v2', 'side-band-64k', 'delete-refs', 'ofs-delta', 'agent=forge/0.1', 'object-format=sha1'];
  if (repo.head) caps.push(`symref=HEAD:${repo.head}`);
  return caps.join(' ');
}

function uploadPackCapabilitiesV0(repo: Repo): string {
  const caps = ['side-band-64k', 'multi_ack_detailed', 'shallow', 'deepen-since', 'deepen-not', 'no-progress', 'include-tag', 'allow-tip-sha1-in-want', 'ofs-delta', 'agent=forge/0.1', 'object-format=sha1'];
  if (repo.head) caps.push(`symref=HEAD:${repo.head}`);
  return caps.join(' ');
}

export async function handleInfoRefs(store: Store, req: IncomingMessage, res: ServerResponse, owner: string, name: string, service: string | null): Promise<void> {
  try {
    const repo = store.getRepo(owner, name);
    if (!repo) { send404(res); return; }
    if (service !== 'git-upload-pack' && service !== 'git-receive-pack') { send404(res); return; }

    if (service === 'git-receive-pack') {
      const { refs } = getRefAdvertisementLines(store, repo, service);
      const caps = receivePackCapabilities(repo);
      const parts: Buffer[] = [];
      parts.push(pkt('# service=git-receive-pack\n'));
      parts.push(pktFlush());
      if (refs.length === 0) {
        parts.push(pkt(`${ZERO_OID} capabilities^{}\0${caps}\n`));
      } else {
        let first = true;
        for (const r of refs) {
          if (first) {
            parts.push(pkt(`${r.oid} ${r.name}\0${caps}\n`));
            first = false;
          } else {
            parts.push(pkt(`${r.oid} ${r.name}\n`));
          }
        }
      }
      parts.push(pktFlush());
      send(res, 200, { 'content-type': 'application/x-git-receive-pack-advertisement', 'cache-control': 'no-cache' }, Buffer.concat(parts));
      return;
    }

    // upload-pack
    const wantsV2 = (req.headers['git-protocol'] || '').toString().includes('version=2');
    if (wantsV2) {
      const parts: Buffer[] = [];
      for (const line of uploadPackCapabilitiesV2()) parts.push(pkt(line + '\n'));
      parts.push(pktFlush());
      send(res, 200, { 'content-type': 'application/x-git-upload-pack-advertisement', 'cache-control': 'no-cache' }, Buffer.concat(parts));
      return;
    }

    // v0
    const { refs } = getRefAdvertisementLines(store, repo, service);
    const caps = uploadPackCapabilitiesV0(repo);
    const parts: Buffer[] = [];
    parts.push(pkt('# service=git-upload-pack\n'));
    parts.push(pktFlush());
    if (refs.length === 0) {
      parts.push(pkt(`${ZERO_OID} capabilities^{}\0${caps}\n`));
    } else {
      let first = true;
      for (const r of refs) {
        if (first) {
          parts.push(pkt(`${r.oid} ${r.name}\0${caps}\n`));
          first = false;
        } else {
          parts.push(pkt(`${r.oid} ${r.name}\n`));
        }
      }
    }
    parts.push(pktFlush());
    send(res, 200, { 'content-type': 'application/x-git-upload-pack-advertisement', 'cache-control': 'no-cache' }, Buffer.concat(parts));
  } catch (err) {
    logGitError('handleInfoRefs', err, { owner, name, service, url: req.url });
    if (!res.headersSent) send(res, 500, { 'content-type': 'text/plain' }, 'Internal Server Error');
    else try { res.end(); } catch {}
  }
}

function parseV2Request(body: Buffer): { command: string; args: string[]; caps: string[] } {
  const pkts = decodePktLines(body);
  let command = '';
  const caps: string[] = [];
  const args: string[] = [];
  let inArgs = false;
  for (const p of pkts) {
    if (p.type === 'delim') { inArgs = true; continue; }
    if (p.type === 'flush') continue;
    const line = p.data.toString('utf8');
    if (!inArgs) {
      if (line.startsWith('command=')) command = line.slice(8).trim();
      else caps.push(line.replace(/\n$/, ''));
    } else {
      args.push(line.replace(/\n$/, ''));
    }
  }
  return { command, args, caps };
}

function findPeeled(repo: Repo, oid: string): string | undefined {
  const obj = repo.objects.get(oid);
  if (!obj || obj.type !== 'tag') return undefined;
  // peel tag chain to commit-ish
  let cur: string | undefined = oid;
  const seen = new Set<string>();
  while (cur) {
    if (seen.has(cur)) return undefined;
    seen.add(cur);
    const o = repo.objects.get(cur);
    if (!o) return undefined;
    if (o.type !== 'tag') return cur;
    const text = o.data.toString('utf8');
    let target: string | undefined;
    for (const line of text.split('\n')) { if (line.startsWith('object ')) { target = line.slice(7).trim(); break; } if (line==='') break; }
    cur = target;
  }
  return undefined;
}

async function handleLsRefs(store: Store, res: ServerResponse, repo: Repo, args: string[]): Promise<void> {
  let wantPeel = false, wantSymrefs = false, wantUnborn = false;
  const prefixes: string[] = [];
  for (const a of args) {
    if (a === 'peel') wantPeel = true;
    else if (a === 'symrefs') wantSymrefs = true;
    else if (a === 'unborn') wantUnborn = true;
    else if (a.startsWith('ref-prefix ')) prefixes.push(a.slice('ref-prefix '.length));
  }
  const matches = (name: string) => prefixes.length === 0 || prefixes.some(p => name.startsWith(p));

  const parts: Buffer[] = [];
  const emit = (line: string) => parts.push(pkt(line + '\n'));

  // HEAD symref
  if (wantSymrefs && repo.head) {
    if (matches('HEAD')) {
      const headOid = repo.refs.get(repo.head);
      if (headOid) {
        emit(`${headOid} HEAD symref-target:${repo.head}`);
      } else if (wantUnborn) {
        emit(`unborn HEAD symref-target:${repo.head}`);
      } else {
        // some servers still advertise unborn? better include if matches; but check
        // emit(`unborn HEAD symref-target:${repo.head}`);
      }
    }
  }

  for (const { name, oid } of store.allRefs(repo)) {
    if (!matches(name)) continue;
    let line = `${oid} ${name}`;
    if (wantPeel) {
      const peeled = findPeeled(repo, oid);
      if (peeled) line += ` peeled:${peeled}`;
    }
    emit(line);
  }
  // unborn head ref if requested and matches and no oid
  if (wantUnborn && repo.head && !repo.refs.has(repo.head) && matches(repo.head)) {
    // may be needed; usually HEAD unborn covers it, but include
  }

  parts.push(pktFlush());
  send(res, 200, { 'content-type': 'application/x-git-upload-pack-result', 'cache-control': 'no-cache' }, Buffer.concat(parts));
}

function sideband(band: number, data: Buffer): Buffer {
  // pkt-line of (1 byte band + data)
  return pkt(Buffer.concat([Buffer.from([band]), data]));
}

interface Depth1CacheEntry { pack: Buffer; v2: Buffer; v0: Buffer }

function collectDepth1Objects(repo: Repo, commitOid: string): GitObject[] | null {
  const commit = repo.objects.get(commitOid);
  if (!commit || commit.type !== 'commit') return null;
  const objects: GitObject[] = [commit];
  const treeOid = parseCommitFull(commit.data).tree;
  if (!treeOid) return objects;
  const seen = new Set<string>();
  const addTree = (oid: string): void => {
    if (seen.has(oid)) return;
    seen.add(oid);
    const obj = repo.objects.get(oid);
    if (!obj) return;
    objects.push(obj);
    if (obj.type !== 'tree') return;
    const buf = obj.data;
    let i = 0;
    while (i < buf.length) {
      const sp = buf.indexOf(0x20, i);
      if (sp < 0) break;
      const nul = buf.indexOf(0x00, sp);
      if (nul < 0) break;
      const mode = buf.subarray(i, sp).toString('ascii');
      const childOid = buf.subarray(nul + 1, nul + 21).toString('hex');
      i = nul + 21;
      const child = repo.objects.get(childOid);
      if (!child) continue;
      if (mode === '40000') addTree(childOid);
      else if (!seen.has(childOid)) { seen.add(childOid); objects.push(child); }
    }
  };
  addTree(treeOid);
  return objects;
}

function getCachedDepth1Fetch(repo: Repo, want: string): Depth1CacheEntry | null {
  if (!repo.depth1PackCache) repo.depth1PackCache = new Map();
  const cached = repo.depth1PackCache.get(want);
  if (cached) return cached;
  const objs = collectDepth1Objects(repo, want);
  if (!objs) return null;
  const pack = writePack(objs);
  const maxChunk = 65500;

  const v2Parts: Buffer[] = [];
  v2Parts.push(pkt('shallow-info\n'));
  v2Parts.push(pkt(`shallow ${want}\n`));
  v2Parts.push(pktDelim());
  v2Parts.push(pkt('packfile\n'));
  for (let i = 0; i < pack.length; i += maxChunk) v2Parts.push(sideband(1, pack.subarray(i, Math.min(i + maxChunk, pack.length))));
  v2Parts.push(pktFlush());

  const v0Parts: Buffer[] = [];
  v0Parts.push(pkt(`shallow ${want}\n`));
  v0Parts.push(pkt('NAK\n'));
  for (let i = 0; i < pack.length; i += maxChunk) v0Parts.push(sideband(1, pack.subarray(i, Math.min(i + maxChunk, pack.length))));
  v0Parts.push(pktFlush());

  const entry: Depth1CacheEntry = { pack, v2: Buffer.concat(v2Parts), v0: Buffer.concat(v0Parts) };
  // keep last few to avoid unbounded growth in odd cases
  if (repo.depth1PackCache.size > 8) {
    const first = repo.depth1PackCache.keys().next().value;
    if (first) repo.depth1PackCache.delete(first);
  }
  repo.depth1PackCache.set(want, entry);
  return entry;
}

function collectReachableForFetch(repo: Repo, wants: string[], haves: Set<string>, depth: number | undefined, clientShallows: Set<string>) {
  const objects = new Map<string, GitObject>();
  const shallowOut = new Set<string>();

  // The objects the client already holds. A normal have reaches all of its trees and blobs; a
  // shallow have reaches its own tree but not its parents (the client does not have them yet).
  const held = new Set<string>();
  const markReachable = (start: string): void => {
    const stack = [start];
    while (stack.length > 0) {
      const oid = stack.pop()!;
      if (held.has(oid)) continue;
      const obj = repo.objects.get(oid);
      if (!obj) continue;
      held.add(oid);
      if (obj.type === 'commit') {
        const info = parseCommitFull(obj.data);
        if (info.tree) stack.push(info.tree);
        if (!clientShallows.has(oid)) for (const parent of info.parents) stack.push(parent);
      } else if (obj.type === 'tree') {
        let i = 0;
        const buf = obj.data;
        while (i < buf.length) {
          const sp = buf.indexOf(0x20, i);
          if (sp < 0) break;
          const nul = buf.indexOf(0x00, sp);
          if (nul < 0) break;
          stack.push(buf.subarray(nul + 1, nul + 21).toString('hex'));
          i = nul + 21;
        }
      } else if (obj.type === 'tag') {
        const target = parseTagTarget(obj.data);
        if (target) stack.push(target);
      }
    }
  };
  for (const have of haves) markReachable(have);

  const addObject = (oid: string): GitObject | undefined => {
    if (held.has(oid)) return repo.objects.get(oid);
    const existing = objects.get(oid);
    if (existing) return existing;
    const obj = repo.objects.get(oid);
    if (!obj) return undefined;
    objects.set(oid, obj);
    return obj;
  };

  const walkTree = (oid: string): void => {
    const obj = addObject(oid);
    if (!obj || obj.type !== 'tree') return;
    let i = 0;
    const buf = obj.data;
    while (i < buf.length) {
      const sp = buf.indexOf(0x20, i);
      if (sp < 0) break;
      const nul = buf.indexOf(0x00, sp);
      if (nul < 0) break;
      const childOid = buf.subarray(nul + 1, nul + 21).toString('hex');
      i = nul + 21;
      if (held.has(childOid)) continue;
      const child = repo.objects.get(childOid);
      if (!child) continue;
      addObject(childOid);
      if (child.type === 'tree') walkTree(childOid);
    }
  };

  const visitedDepth = new Map<string, number>();
  const walkCommit = (oid: string, d: number): void => {
    const prior = visitedDepth.get(oid);
    if (prior !== undefined && prior <= d) return;
    visitedDepth.set(oid, d);
    const commit = repo.objects.get(oid);
    if (!commit) return;
    if (commit.type === 'tag') {
      addObject(oid);
      const target = parseTagTarget(commit.data);
      if (target) walkAny(target, d);
      return;
    }
    if (commit.type !== 'commit') {
      addObject(oid);
      if (commit.type === 'tree') walkTree(oid);
      return;
    }
    addObject(oid);
    const info = parseCommitFull(commit.data);
    if (info.tree) walkTree(info.tree);
    if (depth !== undefined && d >= depth) {
      shallowOut.add(oid);
      return;
    }
    for (const parent of info.parents) {
      // A non-shallow held commit carries its complete tree/blob closure, so there is nothing
      // below it to send. A shallow boundary must still be crossed when the client deepens.
      if (depth === undefined && held.has(parent) && !clientShallows.has(parent)) continue;
      walkCommit(parent, d + 1);
    }
  };

  const walkAny = (oid: string, d: number): void => {
    const obj = repo.objects.get(oid);
    if (!obj) return;
    if (obj.type === 'commit') walkCommit(oid, d);
    else if (obj.type === 'tag') {
      addObject(oid);
      const target = parseTagTarget(obj.data);
      if (target) walkAny(target, d);
    } else {
      addObject(oid);
      if (obj.type === 'tree') walkTree(oid);
    }
  };

  for (const want of wants) walkAny(want, 1);

  const unshallow = new Set<string>();
  for (const boundary of clientShallows) {
    if (!shallowOut.has(boundary)) unshallow.add(boundary);
  }

  return { objects: Array.from(objects.values()), shallow: Array.from(shallowOut), unshallow: Array.from(unshallow) };
}

async function handleFetchV2(store: Store, res: ServerResponse, repo: Repo, args: string[]): Promise<void> {
  const wants: string[] = [];
  const haves: string[] = [];
  const clientShallows = new Set<string>();
  let depth: number | undefined;
  let done = false;
  for (const a of args) {
    if (a.startsWith('want ')) wants.push(a.slice(5).trim());
    else if (a.startsWith('have ')) haves.push(a.slice(5).trim());
    else if (a.startsWith('shallow ')) clientShallows.add(a.slice(8).trim());
    else if (a.startsWith('deepen ')) depth = parseInt(a.slice(7).trim(), 10);
    else if (a === 'done') done = true;
  }
  if (wants.length === 0) {
    send(res, 200, { 'content-type': 'application/x-git-upload-pack-result', 'cache-control': 'no-cache' }, pktFlush());
    return;
  }

  const haveSet = new Set(haves.filter(isOid));

  // Fast path: depth-1 shallow clone of a single tip commit, no negotiation.
  if (depth === 1 && wants.length === 1 && haveSet.size === 0 && clientShallows.size === 0) {
    const cached = getCachedDepth1Fetch(repo, wants[0]!);
    if (cached) {
      send(res, 200, { 'content-type': 'application/x-git-upload-pack-result', 'cache-control': 'no-cache' }, cached.v2);
      return;
    }
  }

  const { objects, shallow, unshallow } = collectReachableForFetch(repo, wants, haveSet, depth, clientShallows);

  const parts: Buffer[] = [];
  const knownHaves = haves.filter(h => repo.objects.has(h));
  if (haves.length > 0) {
    parts.push(pkt('acknowledgments\n'));
    if (knownHaves.length > 0) {
      for (const h of knownHaves) parts.push(pkt(`ACK ${h}\n`));
    } else {
      parts.push(pkt('NAK\n'));
    }
    if (done) parts.push(pkt('ready\n'));
    parts.push(pktDelim());
  }

  if (shallow.length > 0 || unshallow.length > 0) {
    parts.push(pkt('shallow-info\n'));
    for (const s of shallow) parts.push(pkt(`shallow ${s}\n`));
    for (const u of unshallow) parts.push(pkt(`unshallow ${u}\n`));
    parts.push(pktDelim());
  }

  parts.push(pkt('packfile\n'));
  const pack = writePack(objects);
  const maxChunk = 65500;
  for (let i = 0; i < pack.length; i += maxChunk) {
    parts.push(sideband(1, pack.subarray(i, Math.min(i + maxChunk, pack.length))));
  }
  parts.push(pktFlush());

  send(res, 200, { 'content-type': 'application/x-git-upload-pack-result', 'cache-control': 'no-cache' }, Buffer.concat(parts));
}

export async function handleUploadPack(store: Store, req: IncomingMessage, res: ServerResponse, owner: string, name: string): Promise<void> {
  try {
    const repo = store.getRepo(owner, name);
    if (!repo) { send404(res); return; }
    const body = await readBody(req);
    const proto = (req.headers['git-protocol'] || '').toString();
    if (proto.includes('version=2')) {
      const { command, args } = parseV2Request(body);
      if (command === 'ls-refs') return handleLsRefs(store, res, repo, args);
      if (command === 'fetch') return handleFetchV2(store, res, repo, args);
      send(res, 400, { 'content-type': 'text/plain' }, 'unknown command');
      return;
    }
    // v0 upload-pack
    return await handleUploadPackV0(store, res, repo, body);
  } catch (err) {
    logGitError('handleUploadPack', err, { owner, name, url: req.url });
    if (!res.headersSent) send(res, 500, { 'content-type': 'text/plain' }, 'Internal Server Error');
    else try { res.end(); } catch {}
  }
}

async function handleUploadPackV0(store: Store, res: ServerResponse, repo: Repo, body: Buffer): Promise<void> {
  // parse two sections separated by flush: wants/deepen/shallow, then haves/done
  const pkts = decodePktLines(body);
  const wants: string[] = [];
  const haves: string[] = [];
  const clientShallows = new Set<string>();
  let depth: number | undefined;
  for (const p of pkts) {
    if (p.type === 'flush') continue;
    if (p.type !== 'data') continue;
    const line = p.data.toString('utf8').replace(/\n$/, '');
    if (line.startsWith('want ')) {
      const rest = line.slice(5);
      const sp = rest.indexOf(' ');
      wants.push((sp >= 0 ? rest.slice(0, sp) : rest).trim());
    } else if (line.startsWith('shallow ')) clientShallows.add(line.slice(8).trim());
    else if (line.startsWith('deepen ')) depth = parseInt(line.slice(7).trim(), 10);
    else if (line.startsWith('have ')) haves.push(line.slice(5).trim());
    else if (line === 'done') { /* ignore */ }
  }
  if (wants.length === 0) { send(res, 200, { 'content-type': 'application/x-git-upload-pack-result' }, pktFlush()); return; }
  const haveSet = new Set(haves.filter(isOid));

  // Fast path: depth-1 shallow clone of a single tip commit.
  if (depth === 1 && wants.length === 1 && haveSet.size === 0 && clientShallows.size === 0) {
    const cached = getCachedDepth1Fetch(repo, wants[0]!);
    if (cached) {
      send(res, 200, { 'content-type': 'application/x-git-upload-pack-result', 'cache-control': 'no-cache' }, cached.v0);
      return;
    }
  }

  const { objects, shallow, unshallow } = collectReachableForFetch(repo, wants, haveSet, depth, clientShallows);

  const parts: Buffer[] = [];
  for (const s of shallow) parts.push(pkt(`shallow ${s}\n`));
  for (const u of unshallow) parts.push(pkt(`unshallow ${u}\n`));
  if (haves.length > 0) {
    const known = haves.filter(h => repo.objects.has(h));
    if (known.length) {
      for (const h of known) parts.push(pkt(`ACK ${h}\n`));
    } else {
      parts.push(pkt('NAK\n'));
    }
  } else {
    parts.push(pkt('NAK\n'));
  }
  const pack = writePack(objects);
  const maxChunk = 65500;
  for (let i = 0; i < pack.length; i += maxChunk) {
    parts.push(sideband(1, pack.subarray(i, Math.min(i + maxChunk, pack.length))));
  }
  parts.push(pktFlush());
  send(res, 200, { 'content-type': 'application/x-git-upload-pack-result', 'cache-control': 'no-cache' }, Buffer.concat(parts));
}

export async function handleReceivePack(store: Store, req: IncomingMessage, res: ServerResponse, owner: string, name: string): Promise<void> {
  try {
    const repo = store.getRepo(owner, name);
    if (!repo) { send404(res); return; }
    const body = await readBody(req);

    // Split commands pkt-lines from pack: read pkt-lines until flush, remainder is pack
    let off = 0;
    const commands: Array<{ oldOid: string; newOid: string; ref: string }> = [];
    let capsLine = '';
    let commandsDone = false;
    while (off < body.length && !commandsDone) {
      if (off + 4 > body.length) break;
      const hex = body.subarray(off, off + 4).toString('ascii');
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) break;
      const len = parseInt(hex, 16);
      off += 4;
      if (len === 0) { commandsDone = true; break; }
      if (len === 1) { continue; }
      const payloadLen = len - 4;
      if (off + payloadLen > body.length) break;
      const payload = body.subarray(off, off + payloadLen);
      off += payloadLen;
      const line = payload.toString('utf8');
      let cmdLine = line;
      const nul = cmdLine.indexOf('\0');
      if (nul >= 0) { capsLine = cmdLine.slice(nul + 1).replace(/\n$/, ''); cmdLine = cmdLine.slice(0, nul); }
      cmdLine = cmdLine.replace(/\n$/, '');
      const m = /^([0-9a-f]{40}) ([0-9a-f]{40}) (.+)$/.exec(cmdLine);
      if (m) commands.push({ oldOid: m[1]!, newOid: m[2]!, ref: m[3]! });
    }
    const packData = body.subarray(off);

    const useSideBand = capsLine.includes('side-band-64k') || capsLine.includes('side-band');

    let unpackOk = true;
    let unpackMsg = 'ok';

    try {
      if (packData.length > 0) {
        if (packData.length >= 4 && packData.subarray(0, 4).toString('ascii') === 'PACK') {
          const parsed = parsePack(packData);
          for (const obj of parsed.objects.values()) {
            if (!repo.objects.has(obj.oid)) repo.objects.set(obj.oid, obj);
          }
        } else if (packData.length > 0) {
          try {
            const parsed = parsePack(packData);
            for (const obj of parsed.objects.values()) if (!repo.objects.has(obj.oid)) repo.objects.set(obj.oid, obj);
          } catch (e: any) {
            unpackOk = false;
            unpackMsg = e?.message || 'unpack error';
          }
        }
      }
    } catch (e: any) {
      unpackOk = false;
      unpackMsg = e?.message || 'unpack error';
    }

    const refResults: Array<{ ref: string; ok: boolean; msg?: string }> = [];

    if (!unpackOk) {
      for (const c of commands) refResults.push({ ref: c.ref, ok: false, msg: 'unpack failed' });
    } else {
      for (const c of commands) {
        const { oldOid, newOid, ref } = c;
        const cur = repo.refs.get(ref) || ZERO_OID;
        if (newOid === ZERO_OID) {
          if (oldOid !== ZERO_OID && oldOid !== cur) {
            refResults.push({ ref, ok: false, msg: 'old oid mismatch' });
          } else {
            repo.refs.delete(ref);
            refResults.push({ ref, ok: true });
          }
          continue;
        }
        if (cur === ZERO_OID) {
          if (!repo.objects.has(newOid)) {
            refResults.push({ ref, ok: false, msg: 'missing object' });
          } else {
            repo.refs.set(ref, newOid);
            refResults.push({ ref, ok: true });
          }
          continue;
        }
        // update - fast-forward required
        if (oldOid !== ZERO_OID && oldOid !== cur) {
          refResults.push({ ref, ok: false, msg: 'old oid mismatch' });
          continue;
        }
        if (cur === newOid) {
          refResults.push({ ref, ok: true });
          continue;
        }
        if (!repo.objects.has(newOid)) {
          refResults.push({ ref, ok: false, msg: 'missing object' });
          continue;
        }
        const ff = isAncestor(repo, cur, newOid);
        if (!ff) {
          refResults.push({ ref, ok: false, msg: 'non-fast-forward' });
        } else {
          repo.refs.set(ref, newOid);
          refResults.push({ ref, ok: true });
        }
      }
    }

    // build report-status
    const reportLines: string[] = [];
    reportLines.push(`unpack ${unpackOk ? 'ok' : unpackMsg}\n`);
    for (const r of refResults) {
      if (r.ok) reportLines.push(`ok ${r.ref}\n`);
      else reportLines.push(`ng ${r.ref} ${r.msg || 'failed'}\n`);
    }
    const reportPkt = encodePktLines([...reportLines, 'flush']);

    const parts: Buffer[] = [];
    if (useSideBand) {
      const maxChunk = 65500;
      for (let i = 0; i < reportPkt.length; i += maxChunk) {
        parts.push(sideband(1, reportPkt.subarray(i, Math.min(i + maxChunk, reportPkt.length))));
      }
      parts.push(pktFlush());
    } else {
      parts.push(reportPkt);
    }

    send(res, 200, { 'content-type': 'application/x-git-receive-pack-result', 'cache-control': 'no-cache' }, Buffer.concat(parts));
  } catch (err) {
    logGitError('handleReceivePack', err, { owner, name, url: req.url });
    if (!res.headersSent) send(res, 500, { 'content-type': 'text/plain' }, 'Internal Server Error');
    else try { res.end(); } catch {}
  }
}

function isAncestor(repo: Repo, ancestor: string, descendant: string): boolean {
  if (ancestor === descendant) return true;
  if (ancestor === ZERO_OID) return true;
  const seen = new Set<string>();
  const stack = [descendant];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === ancestor) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const obj = repo.objects.get(cur);
    if (!obj) continue;
    if (obj.type === 'commit') {
      const parents = parseCommitParents(obj.data);
      for (const p of parents) stack.push(p);
    }
  }
  return false;
}

export async function handleGitRequest(store: Store, req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> {
  try {
    const gitMatch = /^\/([^/]+)\/([^/]+)\.git(\/.*)?$/.exec(pathname);
    if (!gitMatch) return false;
    const o = decodeURIComponent(gitMatch[1]!);
    const r = decodeURIComponent(gitMatch[2]!);
    const suf = gitMatch[3] || '';

    if (suf.startsWith('/info/refs')) {
      const u = new URL(req.url || '/', 'http://x');
      const service = u.searchParams.get('service');
      await handleInfoRefs(store, req, res, o, r, service);
      return true;
    }
    if (suf === '/git-upload-pack' && req.method === 'POST') {
      await handleUploadPack(store, req, res, o, r);
      return true;
    }
    if (suf === '/git-receive-pack' && req.method === 'POST') {
      await handleReceivePack(store, req, res, o, r);
      return true;
    }
    return false;
  } catch (err) {
    logGitError('handleGitRequest', err, { pathname, url: req.url, method: req.method });
    throw err;
  }
}
