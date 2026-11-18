// STAR SIPHON boot, loop, screen flow, and shot handling.

import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_COLLECT, EVENT_HIT, EVENT_OVER, EVENT_PHASE, EVENT_PULSE, EVENT_WIN } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';
import { createAudio } from './audio.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);

function readBest() {
  try { return Number.parseInt(window.localStorage.getItem('star-siphon.best') ?? '0', 10) || 0; } catch { return 0; }
}
function saveBest(value) {
  try { window.localStorage.setItem('star-siphon.best', String(value)); } catch {}
}

function runShot(name) {
  const scene = stageShot(name, world);
  // Paint synchronously (twice for layered effects) so headless/background tabs always get a frame.
  const opts = { deterministic: true, animOffset: 0.35, pulsePhase: 1.4 };
  renderer.draw(world.state, scene.screen, scene.best, scene.field || { attract: false, repel: false }, opts);
  renderer.draw(world.state, scene.screen, scene.best, scene.field || { attract: false, repel: false }, opts);
  window.__shotReady = true;
}

function runGame() {
  const input = createInput(canvas);
  const audio = createAudio();
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let fieldMode = { attract: false, repel: false };

  function announce(msg) { status.textContent = msg; }

  function updateBestFromState() {
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
  }

  function startGame() {
    audio.unlock();
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Flight engaged. Herd motes into the core. Avoid void rifts.');
  }

  function finish(screenName, msg) {
    screen = screenName;
    updateBestFromState();
    announce(msg);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM) audio.unlock();
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      startGame();
      return;
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
      return;
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Resumed.');
    }
  }

  function processEvents(events) {
    if (events & EVENT_COLLECT) audio.collect();
    if (events & EVENT_PHASE) audio.phase();
    if (events & EVENT_HIT) audio.hit();
    if (events & EVENT_PULSE) audio.pulse(fieldMode.attract && !fieldMode.repel);
    if (events & EVENT_WIN) {
      audio.win();
      finish(SCREEN_WIN, `Star stabilized. Final score ${world.state.score}. Best ${Math.max(best, world.state.score)}.`);
    } else if (events & EVENT_OVER) {
      audio.over();
      finish(SCREEN_OVER, `Core lost. Final score ${world.state.score}. Best ${Math.max(best, world.state.score)}.`);
    } else if (events & EVENT_HIT) {
      announce(`Hull hit. ${world.state.drone.hull} hull remaining.`);
    }
  }

  function step() {
    const move = screen === SCREEN_PLAY ? input.move() : { x: 0, y: 0 };
    fieldMode = screen === SCREEN_PLAY ? input.fieldMode() : { attract: false, repel: false };
    const harmless = screen !== SCREEN_PLAY;
    const events = world.step(STEP, move, fieldMode, { harmless });
    if (screen === SCREEN_PLAY) processEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    const liveScreen = screen === SCREEN_TITLE || screen === SCREEN_PLAY || screen === SCREEN_OVER || screen === SCREEN_WIN;
    if (liveScreen) {
      // Over / win keep stepping harmlessly so the aftermath keeps drifting behind the panel.
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }

    if (screen !== SCREEN_PLAY) {
      // still track pointer field for visuals? no; keep calm
      fieldMode = { attract: false, repel: false };
    } else {
      fieldMode = input.fieldMode();
    }
    renderer.draw(world.state, screen, best, fieldMode);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('STAR SIPHON. Press Space or click to launch.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
