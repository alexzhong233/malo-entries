// SOLARA BAY screenshot recorder. Starts a throwaway static server for game/, drives the four
// deterministic ?shot= scenes in headless Chromium, and writes exactly four verified JPEGs.
// Local tooling only: playwright-core lives in untracked node_modules/.
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = fileURLToPath(new URL('.', import.meta.url));
const gameDir = resolve(here, 'game');
const shotDir = resolve(here, 'screenshots');
const port = 8137 + (process.pid % 500);

const SHOTS = [
  { name: '01-solara-bay-foot.jpg', mode: 'foot', seed: 7, wait: 4000 },
  { name: '02-drive-traffic.jpg', mode: 'drive', seed: 11, wait: 4000 },
  { name: '03-police-chase.jpg', mode: 'police', seed: 23, wait: 7000 },
  { name: '04-mission.jpg', mode: 'mission', seed: 31, wait: 4000 }
];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg', '.png': 'image/png'
};

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://localhost');
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { response.writeHead(400).end(); return; }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = resolve(join(gameDir, normalize(pathname)));
  if (file !== gameDir && !file.startsWith(gameDir + sep)) { response.writeHead(403).end(); return; }
  try {
    const stats = statSync(file);
    if (!stats.isFile()) throw new Error('not a file');
    const size = stats.size;
    response.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'content-length': size, 'cache-control': 'no-store'
    });
    createReadStream(file).pipe(response);
  } catch { response.writeHead(404).end('not found'); }
});
await new Promise((done) => server.listen(port, '127.0.0.1', done));

const browserPath = [
  '/root/.cache/ms-playwright/chromium-1208/chrome-linux/chrome',
  '/root/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome'
].find((p) => existsSync(p));
if (!browserPath) throw new Error('Chromium binary not found');

// JPEG SOF parser: dimensions come from the bytes, never from the filename or page metadata.
function jpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('not a JPEG');
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    let marker = buf[i + 1];
    while (marker === 0xff) { i += 1; marker = buf[i + 1]; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    if (marker === 0xd9 || marker === 0xda) break;
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) break;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    }
    i += 2 + len;
  }
  throw new Error('JPEG has no SOF marker');
}

function verify(name, buf) {
  const { width, height } = jpegSize(buf);
  const long = Math.max(width, height), short = Math.min(width, height);
  const problems = [];
  if (buf.length > 200 * 1024) problems.push(`${buf.length} bytes > 200 KiB`);
  if (long > 1280) problems.push(`long side ${long} > 1280`);
  if (short < 480) problems.push(`short side ${short} < 480`);
  if (problems.length) throw new Error(`${name}: ${problems.join(', ')}`);
  return { width, height, bytes: buf.length };
}

mkdirSync(shotDir, { recursive: true });
for (const file of readdirSync(shotDir)) {
  if (/\.(jpg|jpeg|png)$/i.test(file)) rmSync(join(shotDir, file));
}

const browser = await chromium.launch({
  executablePath: browserPath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling']
});
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const results = [];

try {
  for (const shot of SHOTS) {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${port}/?shot=${shot.mode}&seed=${shot.seed}`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.SB && !!window.SB.createWorld);

    const start = Date.now();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const started = await page.evaluate(() => window.__sbWorld && window.__sbWorld.screen);
    if (started !== 'play') {
      // Click START NEW GAME if the key press was swallowed by focus.
      await page.mouse.click(640, 386);
      await page.waitForTimeout(300);
    }
    try {
      await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 20000 });
    } catch (err) {
      const debug = await page.evaluate(() => ({
        screen: window.__sbWorld && window.__sbWorld.screen,
        time: window.__sbWorld && window.__sbWorld.time
      }));
      throw new Error(`${shot.name}: __shotReady timeout ${JSON.stringify(debug)}; ${errors.join(' | ')}`);
    }
    const remaining = shot.wait - (Date.now() - start);
    if (remaining > 0) await page.waitForTimeout(remaining);

    const state = await page.evaluate(() => {
      const canvas = document.getElementById('game');
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const colors = new Set();
      let hash = 2166136261;
      for (let y = 8; y < canvas.height; y += 16) {
        for (let x = 8; x < canvas.width; x += 16) {
          const i = (y * canvas.width + x) * 4;
          colors.add((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2]);
          hash = Math.imul(hash ^ pixels[i] ^ (pixels[i + 1] << 8), 16777619) >>> 0;
        }
      }
      return {
        time: window.__sbWorld.time,
        screen: window.__sbWorld.screen,
        cars: window.__sbWorld.cars.length,
        peds: window.__sbWorld.peds.length,
        wanted: window.__sbWorld.wanted,
        inCar: !!window.__sbWorld.player.inCar,
        missionIndex: window.__sbWorld.mission.index,
        width: canvas.width, height: canvas.height,
        colors: colors.size, hash
      };
    });
    if (state.screen !== 'play' || state.time < 2) {
      throw new Error(`${shot.name}: sim did not run (${JSON.stringify(state)})`);
    }
    const staged = (shot.mode === 'drive' && state.inCar) ||
      (shot.mode === 'foot' && !state.inCar) ||
      (shot.mode === 'police' && state.wanted >= 3) ||
      (shot.mode === 'mission' && state.missionIndex === 1);
    if (!staged) throw new Error(`${shot.name}: wrong scene state ${JSON.stringify(state)}`);
    if (state.width !== 1280 || state.height !== 720 || state.colors < 80) {
      throw new Error(`${shot.name}: canvas is blank or wrong size (${JSON.stringify(state)})`);
    }
    if (results.some((r) => r.hash === state.hash)) throw new Error(`${shot.name}: duplicate render`);
    if (errors.length) throw new Error(`${shot.name}: page errors: ${errors.join(' | ')}`);

    let dataUrl = null, info = null;
    for (const quality of [0.85, 0.8, 0.75, 0.7]) {
      dataUrl = await page.evaluate((q) => document.getElementById('game').toDataURL('image/jpeg', q), quality);
      const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
      try { info = verify(shot.name, buf); writeFileSync(join(shotDir, shot.name), buf); break; }
      catch (err) { if (quality === 0.7) throw err; }
    }
    results.push({ name: shot.name, mode: shot.mode, ...info, state });
    console.log(`${shot.name}  ${info.width}x${info.height}  ${info.bytes} bytes  sim=${state.time.toFixed(1)}s  cars=${state.cars} peds=${state.peds} wanted=${state.wanted}`);
    await page.close();
  }

  // Systems smoke test in the same browser: audio nodes, effects, police escalation, the complete
// seven-job chain and a save round-trip. It runs off-page and never touches the four captures.
const smokePage = await context.newPage();
const smokeErrors = [];
smokePage.on('pageerror', (e) => smokeErrors.push(String(e)));
await smokePage.goto(`http://127.0.0.1:${port}/?shot=foot&seed=99`, { waitUntil: 'load' });
await smokePage.keyboard.press('Enter');
await smokePage.waitForFunction(() => window.__sbWorld && window.__sbWorld.screen === 'play');
const smoke = await smokePage.evaluate(() => {
  const SB = window.SB;
  const live = window.__sbWorld;
  const a = live.audioRef;
  const audio = { context: !!a.ctx, engine: !!a.engine, siren: !!a.siren, noise: !!a.noise, state: a.ctx ? a.ctx.state : 'none' };
  SB.audio.play(a, 'gun'); SB.audio.play(a, 'pickup');
  SB.audio.play(a, 'mission'); SB.audio.play(a, 'siren');

  const before = live.effects.particles.length;
  SB.effects.explosion(live, live.player.x + 60, live.player.y);
  SB.effects.skid(live, live.player.x, live.player.y, 0.4);
  const cv = document.createElement('canvas'); cv.width = cv.height = 160;
  const cx = cv.getContext('2d');
  live.clock = 21 * 60;
  live.camera.x = 0; live.camera.y = 0; live.camera.zoom = 1;
  SB.effects.drawNight(cx, live);
  const effects = {
    smokeAndFire: live.effects.particles.length - before,
    skids: live.effects.skids.length,
    shake: live.effects.shake,
    nightAlpha: cx.getImageData(80, 80, 1, 1).data[3]
  };

  SB.downPlayer(live, 'busted');
  const bustedScreen = live.screen;
  SB.respawn(live);
  effects.bustedAndRespawn = bustedScreen === 'busted' && live.screen === 'play' &&
    live.player.health === 100 && live.wanted === 0;

  const q = SB.createWorld(404); q.audioRef = null; SB.resetWorld(q, { money: 0 });
  for (let star = 0; star < 5; star += 1) SB.raiseWanted(q, 1, 'smoke test');
  for (let i = 0; i < 900; i += 1) {
    if (i % 30 === 0) { q.wanted = 5; q.unseen = 0; } // keep the heat on for the escalation test
    SB.updatePolice(q, 1 / 60);
  }
  const police = {
    wanted: q.wanted,
    cars: q.cops.length,
    officers: q.peds.filter((p) => p.cop && p.alive).length
  };

  const t = SB.createWorld(777); t.audioRef = null; SB.resetWorld(t, { money: 0 });
  const ctrl = {
    mouse: { x: 640, y: 360, down: false, click: false, right: false },
    isDown: function () { return false; }, axis: function () { return 0; },
    consume: function () { return false; }, clear: function () {},
    aim: function () { return { x: t.player.x + 80, y: t.player.y }; }
  };
  function tick(n) {
    for (let i = 0; i < n; i += 1) {
      t.time += 1 / 60;
      SB.updatePlayer(t, ctrl, 1 / 60);
      SB.missions.update(t, 1 / 60);
    }
  }
  function foot(x, y) { t.player.inCar = null; t.player.x = x; t.player.y = y; }
  function enter(car, x, y) {
    car.x = x; car.y = y; t.player.inCar = car;
    car.player = true; car.occupied = true; t.player.x = x; t.player.y = y;
  }
  function freshCar(x, y) {
    return SB.makeCar(t, x, y, 0, 'sedan', '#cccccc');
  }
  const payouts = [];
  for (let i = 0; i < SB.missions.list.length; i += 1) {
    t.mission.index = i;
    SB.missions.begin(t);
    const money = t.money;
    if (i === 0) {
      foot(600, 540); tick(1);
      foot(600, 900); tick(1);
    } else if (i === 1) {
      foot(720, 619); tick(1);
      enter(t.mission.car, 1500, 919); tick(1);
    } else if (i === 2) {
      foot(-120, 900); tick(1);
      foot(900, 1218); tick(1);
    } else if (i === 3) {
      foot(1500, 1218); tick(1);
      enter(t.mission.car, 300, 1500); tick(1);
    } else if (i === 4) {
      tick(1);
      enter(freshCar(300, 300), 300, 300); tick(1);
    } else if (i === 5) {
      foot(1200, 1500); tick(1);
      for (const ped of t.mission.rivals) ped.alive = false;
      tick(1);
    } else if (i === 6) {
      foot(1500, 900); tick(1);
      t.mission.boss.alive = false; tick(1);
      enter(freshCar(600, 300), 600, 300); tick(1);
    }
    if (t.money - money !== SB.missions.list[i].reward) {
      throw new Error('mission ' + i + ' payout ' + (t.money - money));
    }
    payouts.push(t.money - money);
    tick(340); // let the between-job gap roll into the next job / the completed state
  }
  SB.save.write(t);
  const saved = SB.save.read();
  const missions = {
    count: payouts.length, payouts: payouts,
    done: t.mission.done, stats: t.stats.missions,
    savedIndex: saved && saved.missionIndex, savedDone: saved && saved.missionDone,
    savedMoney: saved && saved.money
  };
  SB.save.clear();
  return { audio, effects, police, missions };
});
if (smokeErrors.length) throw new Error(`smoke test page errors: ${smokeErrors.join(' | ')}`);
if (!smoke.audio.context || !smoke.audio.engine || !smoke.audio.siren || !smoke.audio.noise) {
  throw new Error(`audio graph missing: ${JSON.stringify(smoke.audio)}`);
}
if (smoke.effects.smokeAndFire < 20 || !smoke.effects.skids || smoke.effects.shake <= 0 ||
  smoke.effects.nightAlpha === 0 || !smoke.effects.bustedAndRespawn) {
  throw new Error(`effects failed: ${JSON.stringify(smoke.effects)}`);
}
if (smoke.police.wanted !== 5 || smoke.police.cars < 5 || smoke.police.officers < 3) {
  throw new Error(`police escalation failed: ${JSON.stringify(smoke.police)}`);
}
if (smoke.missions.count !== 7 || !smoke.missions.done || smoke.missions.stats !== 7 ||
  !smoke.missions.savedDone || smoke.missions.savedIndex !== 6) {
  throw new Error(`mission chain failed: ${JSON.stringify(smoke.missions)}`);
}
// Continue path: a synthetic save must restore position, cash, heat, job index and stats.
const continuePage = await context.newPage();
await continuePage.goto(`http://127.0.0.1:${port}/?seed=5`, { waitUntil: 'load' });
await continuePage.evaluate(() => {
  window.localStorage.setItem(window.SB.SAVE_KEY, JSON.stringify({
    version: 1, seed: 42, x: 901, y: 302, money: 4321, wanted: 2, health: 77,
    ammo: 12, gun: false, clock: 1234, missionIndex: 3, missionDone: false,
    stats: { kills: 4, cars: 5, missions: 6 }, savedAt: Date.now()
  }));
});
await continuePage.keyboard.press('ArrowDown');
await continuePage.keyboard.press('Enter');
await continuePage.waitForFunction(() => window.__sbWorld.screen === 'play');
const resumed = await continuePage.evaluate(() => ({
  x: Math.round(window.__sbWorld.player.x), y: Math.round(window.__sbWorld.player.y),
  money: window.__sbWorld.money, wanted: window.__sbWorld.wanted,
  health: window.__sbWorld.player.health, ammo: window.__sbWorld.player.ammo,
  gun: window.__sbWorld.player.gun, clock: Math.round(window.__sbWorld.clock),
  index: window.__sbWorld.mission.index, stats: window.__sbWorld.stats
}));
if (resumed.x !== 901 || resumed.y !== 302 || resumed.money !== 4321 || resumed.wanted !== 2 ||
  resumed.health !== 77 || resumed.ammo !== 12 || resumed.gun !== false ||
  resumed.index !== 3 || resumed.stats.cars !== 5 || resumed.stats.missions !== 6) {
  throw new Error(`Continue did not restore the save: ${JSON.stringify(resumed)}`);
}
await continuePage.evaluate(() => window.localStorage.removeItem(window.SB.SAVE_KEY));
await continuePage.close();

const perf = await smokePage.evaluate(() => new Promise((resolve) => {
  const times = [];
  function frame(t) {
    times.push(t);
    if (times.length < 121) { requestAnimationFrame(frame); return; }
    const deltas = [];
    for (let i = 1; i < times.length; i += 1) deltas.push(times[i] - times[i - 1]);
    deltas.sort((a, b) => a - b);
    const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    resolve({ fps: Math.round(1000 / mean), p95ms: Math.round(deltas[Math.floor(deltas.length * 0.95)] * 10) / 10 });
  }
  requestAnimationFrame(frame);
}));
await smokePage.close();
console.log(`systems: audio=${smoke.audio.state} effects=ok police=${smoke.police.cars}cars/${smoke.police.officers}officers missions=${smoke.missions.count}/save=${smoke.missions.savedDone}`);
console.log(`perf: ${perf.fps} fps average, p95 frame ${perf.p95ms} ms with ${results[1].state.cars} cars / ${results[1].state.peds} peds staged`);

if (readdirSync(shotDir).length !== 4) throw new Error('screenshots/ must hold exactly four files');
writeFileSync(join(here, 'shots.json'), JSON.stringify(results.map((r) => {
  const shot = SHOTS.find((s) => s.name === r.name);
  return { name: r.name, mode: r.mode, seed: shot.seed, query: `?shot=${r.mode}&seed=${shot.seed}` };
}), null, 2) + '\n');
console.log('shots.json updated; exactly four screenshots verified.');
} finally {
  await context.close();
  await browser.close();
  server.close();
}
