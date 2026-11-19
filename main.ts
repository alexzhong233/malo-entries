// SOLARA BAY — a sun-soaked top-down open-world crime game, authored for this entry.
// The playable build is the plain static game/ folder: game/index.html loads classic <script>
// files (no ES modules, no npm, no network), and everything is drawn to one 2D canvas. Seven
// story jobs, traffic, pedestrians, wanted levels, WebAudio, a save game and four real renders
// are included. This program only packages the entry: it first refreshes the four deterministic
// renders through shots.mjs when that local tooling is available, then copies game/, screenshots/
// and the vendored dossier library to MAKEFUN_OUTPUT_DIR (default /output) and writes dossier.json,
// the canonical summary the judge reads, with buildDossier from vendor/makefun-game.ts.
//
// Serve locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
if (resolve(out) === resolve(here)) throw new Error('MAKEFUN_OUTPUT_DIR must not be the source directory');

// Refresh the renders when the recorder and its Chromium are installed. A machine without that
// optional tooling still packages the checked-in screenshots, so the build never fails over it.
if (process.env.MAKEFUN_SKIP_SHOTS !== '1' && existsSync(join(here, 'shots.mjs'))) {
  const refresh = spawnSync(process.execPath, [join(here, 'shots.mjs')], {
    cwd: here, encoding: 'utf8', timeout: 180_000
  });
  if (refresh.status === 0) process.stdout.write(refresh.stdout);
  else console.warn(`screenshot refresh skipped: ${refresh.error ? refresh.error.message : (refresh.stderr || '').trim()}`);
}

// Clean only the packaged subdirectories, so a rebuild never leaves a stale screenshot behind.
for (const name of ['game', 'screenshots', 'vendor']) rmSync(join(out, name), { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'vendor'))) cpSync(join(here, 'vendor'), join(out, 'vendor'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
console.log(`packaged Solara Bay into ${out}`);
