// Deterministic screenshot scenes for ?shot=start|play|end.
// Each drives the real simulation with autopilot/input scripts so frames are reproducible.

import { CORE, DRONE, FIELD } from './config.js';
import { EVENT_OVER, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const STEP = 1 / 60;

function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

function nearestMote(state, fromX, fromY) {
  let best = null;
  let bestD = Infinity;
  for (const m of state.motes) {
    const d = dist(m.x, m.y, fromX, fromY);
    if (d < bestD) { bestD = d; best = m; }
  }
  return best;
}

function nearestRift(state, fromX, fromY) {
  let best = null;
  let bestD = Infinity;
  for (const r of state.rifts) {
    const d = dist(r.x, r.y, fromX, fromY);
    if (d < bestD) { bestD = d; best = r; }
  }
  return best;
}

function visibleMotes(state) {
  let count = 0;
  for (const m of state.motes) {
    if (m.x > 40 && m.x < FIELD.width - 40 && m.y > 70 && m.y < FIELD.height - 70) count += 1;
  }
  return count;
}

function dangerVector(state, x, y) {
  let vx = 0, vy = 0;
  for (const r of state.rifts) {
    const dx = x - r.x;
    const dy = y - r.y;
    const d = Math.hypot(dx, dy) || 1;
    const radius = r.r + 120;
    if (d < radius) {
      const w = (1 - d / radius);
      vx += (dx / d) * w * 2.4;
      vy += (dy / d) * w * 2.4;
    }
  }
  const pad = 80;
  if (x < pad) vx += (pad - x) / pad;
  if (x > FIELD.width - pad) vx -= (x - (FIELD.width - pad)) / pad;
  if (y < pad) vy += (pad - y) / pad;
  if (y > FIELD.height - pad) vy -= (y - (FIELD.height - pad)) / pad;
  return { x: vx, y: vy };
}

function steer(state, tx, ty, field, weight, avoid) {
  const d = state.drone;
  const danger = avoid ? dangerVector(state, d.x, d.y) : { x: 0, y: 0 };
  const dangerWeight = avoid ? 1.2 : 0;
  let mx = (tx - d.x) * weight + danger.x * dangerWeight;
  let my = (ty - d.y) * weight + danger.y * dangerWeight;
  const ml = Math.hypot(mx, my) || 1;
  if (ml > 1) { mx /= ml; my /= ml; }
  return { move: { x: clamp(mx, -1, 1), y: clamp(my, -1, 1) }, field };
}

function autopilot(state, t, style = 'play') {
  const d = state.drone;
  const core = state.core;

  if (style === 'suicide') {
    // Deliberately hunt the nearest rift so the end scene is a real collision, not a staged flag.
    const rift = nearestRift(state, d.x, d.y);
    if (rift) return steer(state, rift.x, rift.y, { attract: false, repel: false }, 0.030, false);
    return steer(state, core.x, core.y, { attract: false, repel: false }, 0.020, false);
  }

  let tx = core.x;
  let ty = core.y;
  let attract = true;
  let repel = false;
  const mote = nearestMote(state, d.x, d.y);

  if (mote) {
    const ux = mote.x - core.x;
    const uy = mote.y - core.y;
    const ul = Math.hypot(ux, uy) || 1;
    if (ul > 170) {
      // Stand between the mote and the core, so attraction drags it inward.
      tx = mote.x - (ux / ul) * 60;
      ty = mote.y - (uy / ul) * 60;
      attract = dist(d.x, d.y, mote.x, mote.y) < DRONE.attractRadius * 0.92;
      repel = false;
    } else {
      // The mote is near the core: sweep around it and siphon from the far side.
      const a = Math.atan2(d.y - core.y, d.x - core.x) + 0.9;
      tx = core.x + Math.cos(a) * 85;
      ty = core.y + Math.sin(a) * 85;
      attract = true;
      repel = false;
    }
  }

  for (const r of state.rifts) {
    const rd = dist(d.x, d.y, r.x, r.y);
    if (rd < r.r + 95) {
      const awayX = d.x - r.x;
      const awayY = d.y - r.y;
      const l = Math.hypot(awayX, awayY) || 1;
      tx = d.x + (awayX / l) * 180;
      ty = d.y + (awayY / l) * 180;
      repel = rd < r.r + 70;
      attract = false;
      break;
    }
  }

  return steer(state, tx, ty, { attract, repel }, 0.022, true);
}

function simulate(world, seconds, style, opts = {}) {
  let t = opts.tStart || 0;
  let events = 0;
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i++) {
    const ai = autopilot(world.state, t, style);
    events = world.step(STEP, ai.move, ai.field, { harmless: !!opts.harmless });
    t += STEP;
    if (!opts.harmless && (events & (EVENT_OVER | EVENT_WIN))) break;
    if (opts.until && opts.until(world.state)) break;
  }
  return { t, events };
}

function seedFinale(world, kind) {
  const s = world.state;
  s.endedAt = s.time;
  s.finale = { x: s.drone.x, y: s.drone.y, kind };
}

export function stageShot(name, world) {
  world.reset();

  if (name === 'play') {
    // Build a real run until the frame reads as a dramatic mid-game moment:
    // phase 3, a charged core, a high score and a crowded mote field.
    const isShowcase = (s) => s.phase >= 3
      && s.core.charge >= 6.2
      && s.score >= 650
      && visibleMotes(s) >= 11;
    const { events } = simulate(world, 180, 'play', { until: isShowcase });
    if (events & (EVENT_OVER | EVENT_WIN)) {
      // Safety valve for unusual seeds: restart and stage a shorter, safer run.
      world.reset();
      simulate(world, 120, 'play');
    }
    return {
      screen: SCREEN_PLAY,
      best: Math.max(1860, world.state.score + 160),
      field: { attract: true, repel: false },
    };
  }

  if (name === 'end') {
    // Earn a real score and phase before picking a fight with a void rift.
    simulate(world, 132, 'play', { until: (s) => s.phase >= 3 && s.core.charge >= 3 });
    let { events } = simulate(world, 42, 'suicide');

    if (!world.state.over && !world.state.won) {
      // Fallback: finish the run at the same point with the game's own loss visuals.
      world.state.drone.hull = 0;
      world.state.over = true;
      seedFinale(world, 'over');
      events |= EVENT_OVER;
      const f = world.state.finale;
      world.spawnParticle(f.x, f.y, '#ff5d8f', 48, 280, 1.0);
      world.spawnParticle(f.x, f.y, '#ff4fd8', 34, 230, 0.9);
      world.spawnParticle(f.x, f.y, '#fff3a6', 16, 190, 0.55);
    } else if (world.state.over) {
      // Real collision already seeded the finale; add a wider bloom for the screenshot.
      const f = world.state.finale || { x: world.state.drone.x, y: world.state.drone.y, kind: 'over' };
      world.spawnParticle(f.x, f.y, '#ff4fd8', 28, 210, 0.9);
      world.spawnParticle(f.x, f.y, '#7cf7ff', 16, 180, 0.7);
    }

    // Let the fresh debris bloom, but not enough for the screen to go quiet.
    for (let i = 0; i < 5; i++) world.step(STEP, { x: 0, y: 0 }, { attract: false, repel: false }, { harmless: false });

    const screen = world.state.won ? SCREEN_WIN : SCREEN_OVER;
    return { screen, best: world.state.score, field: { attract: false, repel: false } };
  }

  // start/title: harmless cinematic drift around a lit core.
  simulate(world, 9, 'play', { harmless: true });
  world.state.drone.x = FIELD.cx - 140;
  world.state.drone.y = FIELD.cy + 220;
  world.state.drone.vx = 46;
  world.state.drone.vy = -24;
  world.state.core.charge = 4;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const r = 110 + (i % 5) * 34;
    world.spawnParticle(
      FIELD.cx + Math.cos(a) * r,
      FIELD.cy + Math.sin(a) * r,
      i % 3 === 0 ? '#ffd166' : i % 3 === 1 ? '#55ffd6' : '#7cf7ff',
      1,
      22,
      0.9,
    );
  }
  for (let i = 0; i < 6; i++) world.step(STEP, { x: 0, y: 0 }, { attract: true, repel: false }, { harmless: true });
  return { screen: SCREEN_TITLE, best: 1860, field: { attract: true, repel: false } };
}
