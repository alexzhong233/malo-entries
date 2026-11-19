// SOLARA BAY - deterministic four-scene screenshot recorder (playwright-core).
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));
const outDir = join(root, 'screenshots');
mkdirSync(outDir, { recursive: true });

function findChromium() {
  if (process.env.CHROMIUM_PATH && existsSync(process.env.CHROMIUM_PATH)) return process.env.CHROMIUM_PATH;
  const roots = ['/root/.cache/ms-playwright', '/home/oai/share/.cache/ms-playwright', '/usr/lib/chromium', '/opt/google/chrome'];
  for (const base of roots) {
    if (!existsSync(base)) continue;
    let dirs = [];
    try { dirs = readdirSync(base).filter((n) => n.startsWith('chromium')).sort().reverse(); } catch { /* ignore */ }
    for (const d of dirs) {
      const candidate = join(base, d, 'chrome-linux64', 'chrome');
      if (existsSync(candidate)) return candidate;
    }
    for (const name of ['chrome', 'chromium', 'chrome-wrapper']) {
      const candidate = join(base, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

const executablePath = findChromium();
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--hide-scrollbars', '--mute-audio']
});
const page = await browser.newPage({
  viewport: cfg.viewport,
  deviceScaleFactor: 1
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(pathToFileURL(join(root, cfg.url)).href);
await page.waitForFunction(() => !!(window.SB && window.SB.debug && window.SB.Render), null, { timeout: 15000 });
await page.waitForTimeout(600);

// Enter the game with a real keyboard event, then position each scene.
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.SB.Game.state === 'playing');
await page.waitForTimeout(500);

async function setup(name) {
  if (name === 'foot-city') {
    await page.evaluate(() => {
      SB.debug.teleport(SB.C.ROAD_X[8] + 60, SB.C.ROAD_Y[7], 0);
      SB.debug.clock(SB.C.DAY_LENGTH * 0.3);
      SB.debug.cash(1250);
      SB.mouseAim = true;
    });
    await page.mouse.move(810, 320);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(260);
    await page.keyboard.up('KeyW');
  } else if (name === 'drive-traffic') {
    await page.evaluate(() => {
      const C = SB.C;
      const y = C.ROAD_Y[8];
      const x = C.ROAD_X[5] - 260;
      SB.debug.drive(x, y + 11, 0, 155);
      SB.debug.trafficBurst(x + 100, y);
      SB.debug.clock(C.DAY_LENGTH * 0.34);
    });
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(280);
    await page.keyboard.up('KeyW');
  } else if (name === 'police-chase') {
    await page.evaluate(() => {
      SB.debug.drive(SB.C.ROAD_X[7] + 160, SB.C.ROAD_Y[7] + 11, 0, 205);
      SB.debug.wanted(4);
      SB.debug.clock(SB.C.DAY_LENGTH * 0.74);
    });
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(620);
    await page.keyboard.up('KeyW');
  } else if (name === 'mission') {
    await page.evaluate(() => {
      SB.debug.mission(3);
      const o = SB.Missions.objective();
      SB.debug.drive(o.x - 190, o.y + 11, 0, 130);
      SB.debug.clock(SB.C.DAY_LENGTH * 0.6);
    });
    await page.waitForTimeout(180);
  }
}

for (const scene of cfg.scenes) {
  await setup(scene.setup);
  await page.waitForTimeout(scene.wait);
  let quality = cfg.quality;
  let buffer = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    buffer = await page.screenshot({ type: 'jpeg', quality: quality });
    if (buffer.length <= cfg.maxBytes || quality <= cfg.minQuality) break;
    quality = Math.max(cfg.minQuality, quality - 6);
  }
  writeFileSync(join(outDir, scene.file), buffer);
  console.log(scene.file, (buffer.length / 1024).toFixed(1) + ' KiB', 'q=' + quality + '%');
}

await browser.close();
if (errors.length) {
  console.warn('Page errors during capture:\n' + errors.slice(0, 12).join('\n'));
  process.exitCode = 1;
} else {
  console.log('All four SOLARA BAY screenshots captured cleanly.');
}
