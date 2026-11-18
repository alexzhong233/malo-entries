import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

/**
 * Build and package the game entry for the make.fun grader.
 *
 * This script mirrors the starter's runtime behavior:
 * - copies `game/` and `screenshots/` from this repository into the output directory
 * - generates `dossier.json` with the same validation caps expected by the scorer
 *
 * Output location defaults to `/output`, but can be overridden with MAKEFUN_OUTPUT_DIR
 * for local verification (e.g. MAKEFUN_OUTPUT_DIR=out).
 */

const SOURCE_ROOT = dirname(fileURLToPath(import.meta.url));
const OUTPUT_ROOT = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const GAME_SOURCE_DIR = join(SOURCE_ROOT, 'game');
const SCREENSHOTS_SOURCE_DIR = join(SOURCE_ROOT, 'screenshots');

const GAME_OUTPUT_DIR = join(OUTPUT_ROOT, 'game');
const SCREENSHOTS_OUTPUT_DIR = join(OUTPUT_ROOT, 'screenshots');
const DOSSIER_OUTPUT_PATH = join(OUTPUT_ROOT, 'dossier.json');

const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
} as const;

function ensureDirectory(path: string): void {
  mkdirSync(path, { recursive: true });
}

function copyGameAssets(): void {
  ensureDirectory(OUTPUT_ROOT);
  cpSync(GAME_SOURCE_DIR, GAME_OUTPUT_DIR, { recursive: true });

  // Always create the screenshots output directory; copy source screenshots when present.
  ensureDirectory(SCREENSHOTS_OUTPUT_DIR);
  if (existsSync(SCREENSHOTS_SOURCE_DIR)) {
    cpSync(SCREENSHOTS_SOURCE_DIR, SCREENSHOTS_OUTPUT_DIR, { recursive: true });
  }
}

function writeDossier(): void {
  const dossierJson = buildDossier(OUTPUT_ROOT, DOSSIER_CAPS);
  writeFileSync(DOSSIER_OUTPUT_PATH, dossierJson);
}

function main(): void {
  copyGameAssets();
  writeDossier();
}

main();
