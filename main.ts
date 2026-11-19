import { buildDossier } from './vendor/makefun-game.ts';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, process.env.MAKEFUN_OUTPUT_DIR || '/output');
const SHOT_MAX_BYTES = 262144;

function screenshotManifest(dir: string) {
  const shots = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith('.'))
    .map((e) => ({ name: e.name, bytes: statSync(join(dir, e.name)).size }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  if (shots.length < 3 || shots.length > 4) {
    throw new Error(`[solara-bay] screenshots/: expected 3-4 images, found ${shots.length}`);
  }
  for (const shot of shots) {
    if (shot.bytes > SHOT_MAX_BYTES) {
      throw new Error(`[solara-bay] screenshots/${shot.name}: ${shot.bytes} bytes exceeds ${SHOT_MAX_BYTES}`);
    }
  }
  return shots.map((s) => `${s.name}=${s.bytes}B`).join('  ');
}

mkdirSync(out, { recursive: true });

try {
  if (existsSync(join(here, 'shots.mjs')) && process.env.MAKEFUN_SKIP_SHOTS !== '1') {
    const result = spawnSync(process.execPath, [join(here, 'shots.mjs')], {
      cwd: here,
      env: process.env,
      stdio: 'inherit'
    });
    if (result.error || result.status !== 0) {
      const why = result.error ? result.error.message : `exit ${result.status}`;
      console.warn(`[solara-bay] screenshot refresh failed (${why}); packaging the checked-in screenshots.`);
    }
  }
} catch (err) {
  console.warn(`[solara-bay] screenshot refresh failed (${err instanceof Error ? err.message : String(err)}); packaging the checked-in screenshots.`);
}

cpSync(join(here, 'game'), join(out, 'game'), { recursive: true, force: true });

if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true, force: true });
}

if (existsSync(join(here, 'vendor'))) {
  cpSync(join(here, 'vendor'), join(out, 'vendor'), { recursive: true, force: true });
}

writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, game_max_files: 993, game_max_bytes: 50331648, game_path_max_bytes: 1000 }));
console.log('[solara-bay] screenshot manifest: ' + screenshotManifest(join(here, 'screenshots')));
console.log('[solara-bay] packaged SOLARA BAY into ' + out);
