import { buildDossier } from './vendor/makefun-game.ts';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, process.env.MAKEFUN_OUTPUT_DIR || '/output');

// Screenshots are checked in; refreshing them is best-effort so packaging also
// works on machines without a browser.
const shots = join(here, 'shots.mjs');
try {
  if (existsSync(shots) && process.env.MAKEFUN_SKIP_SHOTS !== '1') {
    console.log('Refreshing screenshots...');
    const result = spawnSync(process.execPath, [shots], {
      cwd: here,
      stdio: 'inherit',
      timeout: 240000
    });
    if (result.error || result.status !== 0) {
      console.warn('Warning: screenshot refresh failed; using checked-in screenshots.', result.error || ('exit ' + result.status));
    }
  }
} catch (err) {
  // A recorder crash must never stop the checked-in game from being packaged.
  console.warn('Warning: screenshot refresh failed; using checked-in screenshots.', err);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}
if (existsSync(join(here, 'vendor'))) {
  cpSync(join(here, 'vendor'), join(out, 'vendor'), { recursive: true });
}

writeFileSync(join(out, 'dossier.json'), buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000
}));

// Validate the checked-in captures that were just copied into the package.
const maxShotBytes = 262144;
const shotDir = join(here, 'screenshots');
const shotsOnDisk = existsSync(shotDir)
  ? readdirSync(shotDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => ({ name: entry.name, bytes: statSync(join(shotDir, entry.name)).size }))
    .sort((a, b) => a.name.localeCompare(b.name))
  : [];
if (shotsOnDisk.length < 3 || shotsOnDisk.length > 4) {
  throw new Error('Screenshot validation failed: expected 3-4 files in screenshots/, found ' + shotsOnDisk.length);
}
const oversized = shotsOnDisk.filter((shot) => shot.bytes > maxShotBytes);
if (oversized.length) {
  throw new Error('Screenshot validation failed: over ' + maxShotBytes + ' bytes: ' +
    oversized.map((shot) => shot.name + ' (' + shot.bytes + ')').join(', '));
}
console.log('Screenshot manifest (' + shotsOnDisk.length + ' files): ' +
  shotsOnDisk.map((shot) => shot.name + ' ' + shot.bytes + ' bytes').join(', '));

console.log('Dossier written to', join(out, 'dossier.json'));
