// Gate validator for token-radar-01. Reads the built output and the sealed snapshot, checks every
// hard rule, and prints file sizes. Usage: node validate.mjs <output-dir> <snapshot.json>
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from './vendor/makefun-board.ts';

const out = process.argv[2] ?? 'out1';
const snapPath = process.argv[3] ?? '../token-radar-01-kit/input/snapshot.json';
const snap = JSON.parse(readFileSync(snapPath, 'utf8'));
const boardBytes = readFileSync(join(out, 'board.json'));
const board = JSON.parse(boardBytes.toString('utf8'));
const failures = [];
const ok = (cond, msg) => { if (!cond) failures.push(msg); };

// --- board.json shape ---
ok(board && Array.isArray(board.rows), 'board.json has no rows array');
const rows = board.rows || [];
ok(rows.length >= 100 && rows.length <= 4000, `rows = ${rows.length}, not 100..4000`);
ok(boardBytes.length <= 8 * 1024 * 1024, `board.json = ${boardBytes.length} bytes, over 8 MiB`);
const snapshotSlugs = new Set(snap.protocols.map((p) => p.slug));
const seen = new Set();
for (const [i, r] of rows.entries()) {
  ok(typeof r.slug === 'string' && snapshotSlugs.has(r.slug) && !/\s/.test(r.slug), `row ${i}: bad slug ${r.slug}`);
  ok(!seen.has(r.slug), `row ${i}: duplicate slug ${r.slug}`);
  seen.add(r.slug);
  ok(typeof r.name === 'string' && r.name.trim().length > 0, `row ${i}: empty name`);
  ok(Number.isSafeInteger(r.rank) && r.rank > 0, `row ${i}: bad rank ${r.rank}`);
  ok(Number.isSafeInteger(r.implied_value_usd) && r.implied_value_usd > 0 && r.implied_value_usd <= 100_000_000_000_000, `row ${i}: bad implied value ${r.implied_value_usd}`);
  const st = r.farm_steps;
  ok(Array.isArray(st) && st.length >= 3 && st.length <= 12, `row ${i}: ${st?.length} farm steps`);
  if (Array.isArray(st)) for (const [j, s] of st.entries()) {
    ok(typeof s === 'string' && s.trim().length >= 20 && s.trim().length <= 600, `row ${i} step ${j}: ${String(s).trim().length} chars`);
  }
}
// ranks exactly 1..N once each (independent of order)
const rankSet = new Set(rows.map((r) => r.rank));
ok(rankSet.size === rows.length && Math.min(...rankSet) === 1 && Math.max(...rankSet) === rows.length, 'ranks are not exactly 1..N once each');
// non-increasing in array order
for (let i = 1; i < rows.length; i++) ok(rows[i].implied_value_usd <= rows[i - 1].implied_value_usd, `row ${i} rises in implied value`);
ok(rows.length >= 2 && new Set(rows.map((r) => r.implied_value_usd)).size > 1, 'all implied values equal');
// coverage
const watch = new Set(snap.watchlist);
const missing = snap.watchlist.filter((s) => !seen.has(s));
ok(missing.length === 0, `missing ${missing.length} watchlist slugs: ${missing.slice(0, 5)}`);
const beyond = rows.filter((r) => !watch.has(r.slug)).length;
ok(beyond >= 60, `only ${beyond} rows beyond the watchlist (need >= 60)`);

// --- dashboard/ ---
const dashDir = join(out, 'dashboard');
const dashFiles = readdirSync(dashDir).filter((f) => statSync(join(dashDir, f)).isFile());
ok(dashFiles.includes('index.html'), 'dashboard has no index.html');
ok(dashFiles.some((f) => f.endsWith('.css')), 'dashboard has no .css');
ok(dashFiles.some((f) => f.endsWith('.js')), 'dashboard has no .js');
ok(dashFiles.length <= 400, `dashboard has ${dashFiles.length} files`);
let dashBytes = 0;
for (const f of dashFiles) {
  ok(/^[A-Za-z0-9_][A-Za-z0-9._-]*$/.test(f), `bad dashboard filename ${f}`);
  const size = statSync(join(dashDir, f)).size;
  dashBytes += size;
  const text = readFileSync(join(dashDir, f), 'utf8');
  ok(!/https?:\/\//i.test(text), `dashboard/${f} contains a URL`);
}
ok(dashBytes <= 4 * 1024 * 1024, `dashboard = ${dashBytes} bytes, over 4 MiB`);
const srcBytes = ['index.html', 'app.css', 'app.js'].reduce((n, f) => n + (statSync(join(dashDir, f)).size || 0), 0);
ok(srcBytes < 64000, `dashboard source = ${srcBytes} bytes, over 64 KB`);

// --- screenshots/ ---
const shotsDir = join(out, 'screenshots');
const shots = readdirSync(shotsDir).filter((f) => statSync(join(shotsDir, f)).isFile() && !f.startsWith('.'));
ok(shots.length >= 3 && shots.length <= 4, `screenshots = ${shots.length}, not 3..4`);
for (const name of shots) {
  const bytes = readFileSync(join(shotsDir, name));
  ok(bytes.length <= 512 * 1024, `screenshot ${name} = ${bytes.length} bytes, over 512 KiB`);
  let w = 0, h = 0;
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    w = bytes.readUInt32BE(16); h = bytes.readUInt32BE(20);
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let p = 2;
    while (p < bytes.length - 9) {
      if (bytes[p] !== 0xff) { p++; continue; }
      const m = bytes[p + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) { h = bytes.readUInt16BE(p + 5); w = bytes.readUInt16BE(p + 7); break; }
      p += 2 + bytes.readUInt16BE(p + 2);
    }
  } else ok(false, `screenshot ${name} is not PNG or JPEG`);
  ok(Math.max(w, h) <= 1440 && Math.min(w, h) >= 800, `screenshot ${name} is ${w}x${h}, outside 800..1440`);
}

// --- dossier byte identity (reference call: only text_max_bytes) ---
const dossierBytes = readFileSync(join(out, 'dossier.json'));
const rebuilt = buildDossier(out, { text_max_bytes: 65536 });
ok(Buffer.from(rebuilt).equals(dossierBytes), 'dossier.json is not byte-identical to buildDossier(out, {text_max_bytes:65536})');

// --- report ---
const dataJs = readFileSync(join(out, 'data.js'));
console.log(`OUTPUT ${out}`);
console.log(`  board.json      ${String(boardBytes.length).padStart(8)} bytes, ${rows.length} rows, ${beyond} beyond watchlist`);
console.log(`  data.js         ${String(dataJs.length).padStart(8)} bytes, URL present: ${/https?:\/\//i.test(dataJs.toString('utf8'))}`);
console.log(`  dashboard/      ${String(dashBytes).padStart(8)} bytes, ${dashFiles.length} files (source ${srcBytes} bytes)`);
console.log(`  screenshots/    ${shots.length} images: ${shots.map((s) => s + ' ' + statSync(join(shotsDir, s)).size + 'B').join(', ')}`);
console.log(`  dossier.json    ${String(dossierBytes.length).padStart(8)} bytes`);
console.log(`  top value       ${rows[0]?.name} $${(rows[0]?.implied_value_usd / 1e6).toFixed(1)}M  →  bottom $${(rows[rows.length - 1]?.implied_value_usd / 1e6).toFixed(2)}M`);
if (failures.length) {
  console.error(`FAIL (${failures.length}):`);
  for (const f of failures.slice(0, 40)) console.error('  - ' + f);
  process.exit(1);
}
console.log('ALL GATE CHECKS PASSED');
