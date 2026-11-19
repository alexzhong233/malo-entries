import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

const root = dirname(fileURLToPath(import.meta.url));
const shotsDir = join(root, 'screenshots');
const config = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function findChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const cache = join(homedir(), '.cache', 'ms-playwright');
  if (!existsSync(cache)) return undefined;
  const dirs = readdirSync(cache).filter((n) => n.startsWith('chromium-')).sort().reverse();
  for (const dir of dirs) {
    for (const inner of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
      const candidate = join(cache, dir, inner);
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

function screenPointForTarget(page) {
  return page.evaluate(() => {
    const w = window.SB.world();
    const t = w.targets.find((v) => v.alive);
    if (!t) return null;
    const cam = w.camera;
    return {
      x: (t.x - cam.x) * cam.zoom + window.SB.view.w * 0.5,
      y: (t.y - cam.y) * cam.zoom + window.SB.view.h * 0.5
    };
  });
}

async function shootScene(page, scene) {
  await page.evaluate((name) => window.SB.debug.scene(name), scene.scene);
  await wait(scene.settle || 400);

  let mouse = scene.mouse;
  if (scene.aimAt === 'target') {
    const point = await screenPointForTarget(page);
    if (point) mouse = point;
  }
  if (mouse) await page.mouse.move(mouse.x, mouse.y);

  for (const step of scene.hold || []) {
    for (const key of step.keys || []) await page.keyboard.down(key);
    await wait(step.ms || 200);
    for (const key of step.keys || []) await page.keyboard.up(key);
  }
  if (scene.click) {
    await page.mouse.down();
    await wait(scene.click.ms || 40);
    await page.mouse.up();
  }
  await wait(scene.after || 100);
}

async function capture(page, scene) {
  const path = join(shotsDir, scene.file);
  let quality = Math.round((config.quality || 0.86) * 100);
  let size = 0;
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.screenshot({ path, type: 'jpeg', quality, scale: 'css' });
    size = statSync(path).size;
    if (size <= (config.maxBytes || 262144)) break;
    quality = Math.max(58, quality - 5);
  }
  console.log(`[shots] ${scene.file}  ${(size / 1024).toFixed(1)} KiB  q=${(quality / 100).toFixed(2)}`);
  return size;
}

async function main() {
  mkdirSync(shotsDir, { recursive: true });
  const executablePath = findChromium();
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--mute-audio']
  });
  try {
    const page = await browser.newPage({
      viewport: config.viewport || { width: 1280, height: 720 },
      deviceScaleFactor: 1
    });
    page.on('pageerror', (err) => console.warn('[shots] page error:', err.message));
    const url = pathToFileURL(join(root, 'game', 'index.html')).href;
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => window.SB && window.SB.ready, { timeout: 20000 });
    await wait(700);
    for (const scene of config.scenes) {
      await shootScene(page, scene);
      await capture(page, scene);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('[shots] failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
