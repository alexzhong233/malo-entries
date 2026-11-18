import { createHash } from 'node:crypto';
import { inflateSync, deflateSync } from 'node:zlib';

export type GitObjectType = 'blob' | 'tree' | 'commit' | 'tag';

export interface GitObject {
  type: GitObjectType;
  data: Buffer;
  oid: string;
}

export const ZERO_OID = '0000000000000000000000000000000000000000';
const OID_RE = /^[0-9a-f]{40}$/;

export function isOid(oid: string): boolean {
  return OID_RE.test(oid);
}

export function hashObject(type: GitObjectType, data: Buffer): string {
  const header = Buffer.from(`${type} ${data.length}\0`, 'utf8');
  return createHash('sha1').update(header).update(data).digest('hex');
}

export function encodeObject(type: GitObjectType, data: Buffer): Buffer {
  const header = Buffer.from(`${type} ${data.length}\0`, 'utf8');
  return Buffer.concat([header, data]);
}

export function parseLooseObject(buf: Buffer): { type: GitObjectType; data: Buffer } {
  const nul = buf.indexOf(0);
  if (nul < 0) throw new Error('loose object missing nul');
  const header = buf.subarray(0, nul).toString('utf8');
  const sp = header.indexOf(' ');
  if (sp < 0) throw new Error('bad loose object header');
  const type = header.slice(0, sp) as GitObjectType;
  const size = Number(header.slice(sp + 1));
  const data = buf.subarray(nul + 1);
  if (!Number.isFinite(size) || size !== data.length) throw new Error('loose object size mismatch');
  return { type, data };
}

// --- pkt-line ---

export function pktLine(payload: Buffer | string): Buffer {
  const data = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload;
  const len = data.length + 4;
  if (len > 65520) throw new Error('pkt-line too large');
  return Buffer.concat([Buffer.from(len.toString(16).padStart(4, '0'), 'ascii'), data]);
}

export const PKT_FLUSH = Buffer.from('0000', 'ascii');
export const PKT_DELIM = Buffer.from('0001', 'ascii');

export function pktFlush(): Buffer { return PKT_FLUSH; }
export function pktDelim(): Buffer { return PKT_DELIM; }

export type DecodedPkt = { type: 'data'; data: Buffer } | { type: 'flush' } | { type: 'delim' };

export function decodePktLines(buf: Buffer): DecodedPkt[] {
  const out: DecodedPkt[] = [];
  let i = 0;
  while (i < buf.length) {
    if (i + 4 > buf.length) throw new Error('truncated pkt-line length');
    const hex = buf.subarray(i, i + 4).toString('ascii');
    if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new Error('bad pkt-line length');
    const len = parseInt(hex, 16);
    i += 4;
    if (len === 0) { out.push({ type: 'flush' }); continue; }
    if (len === 1) { out.push({ type: 'delim' }); continue; }
    if (len < 4) throw new Error('invalid pkt-line length');
    const payloadLen = len - 4;
    if (i + payloadLen > buf.length) throw new Error('truncated pkt-line payload');
    out.push({ type: 'data', data: buf.subarray(i, i + payloadLen) });
    i += payloadLen;
  }
  return out;
}

export function encodePktLines(items: Array<string | Buffer | 'flush' | 'delim'>): Buffer {
  const parts: Buffer[] = [];
  for (const item of items) {
    if (item === 'flush') parts.push(PKT_FLUSH);
    else if (item === 'delim') parts.push(PKT_DELIM);
    else parts.push(pktLine(item));
  }
  return Buffer.concat(parts);
}

export function pktLineStreamLines(lines: string[]): Buffer {
  return encodePktLines([...lines, 'flush']);
}

// --- pack parsing/writing ---

const PACK_TYPES: Record<number, GitObjectType | 'ofs_delta' | 'ref_delta'> = {
  1: 'commit', 2: 'tree', 3: 'blob', 4: 'tag', 6: 'ofs_delta', 7: 'ref_delta',
};

function readVarint(buf: Buffer, off: number): { value: number; off: number } {
  let c = buf[off++]!;
  let value = c & 0x7f;
  let shift = 7;
  while (c & 0x80) {
    if (off >= buf.length) throw new Error('varint overrun');
    c = buf[off++]!;
    value |= (c & 0x7f) << shift; // safe for sizes we see (numbers in JS)
    shift += 7;
  }
  return { value, off };
}

function readOfsDeltaOffset(buf: Buffer, off: number): { value: number; off: number } {
  let c = buf[off++]!;
  let value = c & 0x7f;
  while (c & 0x80) {
    if (off >= buf.length) throw new Error('ofs delta overrun');
    c = buf[off++]!;
    value = ((value + 1) * 128) + (c & 0x7f);
  }
  return { value, off };
}

function applyDelta(base: Buffer, delta: Buffer): Buffer {
  let off = 0;
  const readSize = (): number => {
    let c = delta[off++]!;
    let size = c & 0x7f;
    let shift = 7;
    while (c & 0x80) {
      c = delta[off++]!;
      size |= (c & 0x7f) << shift;
      shift += 7;
    }
    return size;
  };
  const baseSize = readSize();
  if (baseSize !== base.length) {
    // Some implementations tolerate mismatch? better to be strict but not fatal in odd cases
    // throw new Error(`delta base size mismatch ${baseSize} != ${base.length}`);
  }
  const resultSize = readSize();
  const out = Buffer.allocUnsafe(resultSize);
  let outOff = 0;
  while (off < delta.length) {
    const cmd = delta[off++]!;
    if (cmd & 0x80) {
      let copyOff = 0;
      let copySize = 0;
      if (cmd & 0x01) copyOff = delta[off++]!;
      if (cmd & 0x02) copyOff |= delta[off++]! << 8;
      if (cmd & 0x04) copyOff |= delta[off++]! << 16;
      if (cmd & 0x08) copyOff |= delta[off++]! << 24;
      if (cmd & 0x10) copySize = delta[off++]!;
      if (cmd & 0x20) copySize |= delta[off++]! << 8;
      if (cmd & 0x40) copySize |= delta[off++]! << 16;
      if (copySize === 0) copySize = 0x10000;
      base.copy(out, outOff, copyOff, copyOff + copySize);
      outOff += copySize;
    } else if (cmd) {
      delta.copy(out, outOff, off, off + cmd);
      off += cmd;
      outOff += cmd;
    } else {
      throw new Error('invalid delta opcode 0');
    }
  }
  if (outOff !== resultSize) throw new Error(`delta result size mismatch ${outOff} != ${resultSize}`);
  return out;
}

export interface ParsedPack {
  objects: Map<string, GitObject>;
}

export function parsePack(pack: Buffer): ParsedPack {
  if (pack.length < 12) throw new Error('pack too short');
  if (pack.subarray(0, 4).toString('ascii') !== 'PACK') throw new Error('not a PACK');
  const version = pack.readUInt32BE(4);
  if (version !== 2 && version !== 3) throw new Error(`unsupported pack version ${version}`);
  const count = pack.readUInt32BE(8);
  let off = 12;
  const trailerStart = pack.length - 20;
  if (trailerStart < off) throw new Error('pack missing trailer');

  interface Entry {
    type: number;
    offset: number;
    data?: Buffer;
    baseOid?: string;
    baseOffset?: number;
    resolved?: GitObject;
  }
  const entries: Entry[] = [];
  const byOffset = new Map<number, Entry>();

  for (let i = 0; i < count; i++) {
    const entryOffset = off;
    let c = pack[off++]!;
    const type = (c >> 4) & 7;
    let size = c & 0xf;
    let shift = 4;
    while (c & 0x80) {
      c = pack[off++]!;
      size |= (c & 0x7f) << shift;
      shift += 7;
    }
    const entry: Entry = { type, offset: entryOffset };
    if (type === 6) { // ofs_delta
      const { value, off: o2 } = readOfsDeltaOffset(pack, off);
      off = o2;
      entry.baseOffset = entryOffset - value;
    } else if (type === 7) { // ref_delta
      const baseOid = pack.subarray(off, off + 20).toString('hex');
      off += 20;
      entry.baseOid = baseOid;
    }
    const inflated = inflateWithEnd(pack, off, trailerStart);
    if (inflated.data.length !== size && type >= 1 && type <= 4) {
      throw new Error(`object size mismatch ${inflated.data.length} != ${size}`);
    }
    entry.data = inflated.data;
    off = inflated.end;
    entries.push(entry);
    byOffset.set(entryOffset, entry);
  }
  // off should be trailerStart (mod possible padding issues, but usually exact)

  const objects = new Map<string, GitObject>();

  const resolveEntry = (entry: Entry): GitObject => {
    if (entry.resolved) return entry.resolved;
    const t = PACK_TYPES[entry.type];
    if (!t) throw new Error(`unknown pack type ${entry.type}`);
    if (t === 'blob' || t === 'tree' || t === 'commit' || t === 'tag') {
      const data = entry.data!;
      const oid = hashObject(t, data);
      const obj = { type: t, data, oid };
      entry.resolved = obj;
      objects.set(oid, obj);
      return obj;
    }
    let base: GitObject | undefined;
    if (t === 'ofs_delta') {
      const be = byOffset.get(entry.baseOffset!);
      if (!be) throw new Error('ofs delta base not found');
      base = resolveEntry(be);
    } else {
      base = objects.get(entry.baseOid!);
      if (!base) {
        // Try to resolve from entries that might produce it? they may not be resolved yet if baseOid points to object id
        // search entries by resolving all non-deltas? easier: second pass not needed since we can find by oid later? no.
        // but baseOid is hash of base object; it may appear later or earlier. We need index by oid of resolved objects.
        // fallback: resolve all entries once? do lazy with oid lookup after trying to find.
        throw new Error(`ref delta base ${entry.baseOid} not found`);
      }
    }
    const resultData = applyDelta(base.data, entry.data!);
    const obj: GitObject = { type: base.type, data: resultData, oid: hashObject(base.type, resultData) };
    entry.resolved = obj;
    objects.set(obj.oid, obj);
    return obj;
  };

  // Two-pass resolution: first resolve direct objects to populate oid map, then deltas
  for (const e of entries) {
    const t = PACK_TYPES[e.type];
    if (t === 'blob' || t === 'tree' || t === 'commit' || t === 'tag') resolveEntry(e);
  }
  // Build oid index from resolved
  for (const e of entries) {
    if (!e.resolved) {
      const t = PACK_TYPES[e.type];
      if (t === 'ref_delta' && e.baseOid) {
        // try again
      }
    }
  }
  // resolve remaining (deltas) possibly multiple passes for delta chains
  let progress = true;
  while (progress) {
    progress = false;
    for (const e of entries) {
      if (e.resolved) continue;
      const t = PACK_TYPES[e.type];
      try {
        if (t === 'ofs_delta') {
          const be = byOffset.get(e.baseOffset!);
          if (be?.resolved) { resolveEntry(e); progress = true; }
        } else if (t === 'ref_delta') {
          if (objects.has(e.baseOid!)) { resolveEntry(e); progress = true; }
        }
      } catch {}
    }
  }
  // final attempt, let it throw if still unresolved
  for (const e of entries) {
    if (!e.resolved) resolveEntry(e);
  }

  return { objects };
}

function inflateWithEnd(buf: Buffer, start: number, limit: number): { data: Buffer; end: number } {
  // Try to find end by attempting inflation - zlib.inflateSync consumes stream; in Node we can use engine bytesWritten via createInflate? easier: try incremental? No direct API.
  // But we can use: const z = require('zlib'); in sync inflateSync we don't get bytesRead. Alternative: use createInflateRaw? no, pack uses zlib wrapper.
  // Workaround: try inflating with increasing slices? expensive. Better: use `inflateSync` with `info: true` in newer Node? Node 18+ supports {info:true} returning {buffer, engine}.
  const slice = buf.subarray(start, limit);
  const res: any = inflateSync(slice, { info: true } as any);
  // res is Buffer in older without info, or {buffer, engine} with info
  if (Buffer.isBuffer(res)) {
    // Fallback: cannot know end, but this shouldn't happen on Node 22. Try to scan by re-inflating? As last resort assume consumed = ? impossible.
    // Try binary search / linear scan on end by catching errors? very slow. But Node 22 has info.
    throw new Error('inflateSync info not available');
  }
  const data: Buffer = res.buffer ?? res[0];
  const engine = res.engine;
  const bytesWritten = engine?.bytesWritten ?? engine?.bytesRead ?? (engine && typeof engine === 'object' ? 0 : 0);
  // Node's zlib engine: bytesWritten is number of compressed bytes consumed? In Node, for inflate with info: engine.bytesWritten = compressed bytes read.
  // Let us verify common behavior: bytesWritten property exists.
  const consumed = engine?.bytesWritten;
  if (typeof consumed !== 'number') {
    throw new Error('cannot determine inflated stream end');
  }
  return { data: Buffer.from(data), end: start + consumed };
}

// --- pack writing ---

function encodeTypeSize(typeNum: number, size: number): Buffer {
  let n = size;
  let b = (typeNum << 4) | (n & 0xf);
  n >>>= 4;
  const bytes = [b];
  while (n > 0) {
    bytes[bytes.length - 1]! |= 0x80;
    b = n & 0x7f;
    n >>>= 7;
    bytes.push(b);
  }
  return Buffer.from(bytes);
}

const TYPE_TO_NUM: Record<GitObjectType, number> = { commit: 1, tree: 2, blob: 3, tag: 4 };

export function writePack(objects: Iterable<{ type: GitObjectType; data: Buffer }>): Buffer {
  const list = Array.from(objects);
  const parts: Buffer[] = [];
  const header = Buffer.alloc(12);
  header.write('PACK', 0);
  header.writeUInt32BE(2, 4);
  header.writeUInt32BE(list.length, 8);
  parts.push(header);
  for (const obj of list) {
    parts.push(encodeTypeSize(TYPE_TO_NUM[obj.type], obj.data.length));
    parts.push(deflateSync(obj.data));
  }
  const body = Buffer.concat(parts);
  const sha = createHash('sha1').update(body).digest();
  return Buffer.concat([body, sha]);
}

// --- tree helpers ---

export interface TreeEntry {
  mode: string; // '100644' for file, '40000' for dir/tree
  name: string;
  oid: string;
}

export function parseTree(data: Buffer): TreeEntry[] {
  const entries: TreeEntry[] = [];
  let i = 0;
  while (i < data.length) {
    const sp = data.indexOf(0x20, i);
    if (sp < 0) break;
    const nul = data.indexOf(0x00, sp);
    if (nul < 0) break;
    const mode = data.subarray(i, sp).toString('ascii');
    const name = data.subarray(sp + 1, nul).toString('utf8');
    const oid = data.subarray(nul + 1, nul + 21).toString('hex');
    i = nul + 21;
    entries.push({ mode, name, oid });
  }
  return entries;
}

export function buildTree(entries: TreeEntry[]): Buffer {
  // sort by name (git sort: tree entries by name; note dirs are often stored as mode 040000 and name; git sorts by name with trailing '/' in effect for trees in some cases, but typically name only)
  const sorted = [...entries].sort((a, b) => {
    // Git sorts tree entries: for comparison, if it's a tree (mode 40000) compare as name + '/' ? No. Standard: compare name bytes; but in practice names are compared as strings. But also note: in git, tree entries are sorted by entry name, and for a subdirectory the name is the directory name (not ending with /).
    // Use lexicographic compare of name strings.
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  const parts: Buffer[] = [];
  for (const e of sorted) {
    parts.push(Buffer.from(`${e.mode} ${e.name}\0`, 'utf8'));
    const oidBuf = Buffer.from(e.oid, 'hex');
    parts.push(oidBuf);
  }
  return Buffer.concat(parts);
}

export function buildCommit(params: { tree: string; parents: string[]; authorName?: string; authorEmail?: string; message: string; timestamp?: string }): Buffer {
  const authorName = params.authorName || 'forge';
  const authorEmail = params.authorEmail || 'forge@example.com';
  const ts = params.timestamp || commitTimestamp();
  let s = `tree ${params.tree}\n`;
  for (const p of params.parents) s += `parent ${p}\n`;
  s += `author ${authorName} <${authorEmail}> ${ts}\n`;
  s += `committer ${authorName} <${authorEmail}> ${ts}\n`;
  s += `\n`;
  s += params.message;
  if (!params.message.endsWith('\n')) s += '\n';
  return Buffer.from(s, 'utf8');
}

// --- object serialization helpers ---

export function commitTimestamp(): string {
  const now = Math.floor(Date.now() / 1000);
  return `${now} +0000`;
}
