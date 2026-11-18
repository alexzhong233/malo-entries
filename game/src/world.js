// STAR SIPHON simulation: drone, core, energy motes, void rifts, particles, scoring and phases.
// No rendering/browser code. step() mutates state and returns event flags.

import { CORE, DRONE, FIELD, MOTE, PARTICLE_LIMIT, RIFT } from './config.js';
import { randRange } from './random.js';

export const EVENT_COLLECT = 1;
export const EVENT_PHASE = 2;
export const EVENT_HIT = 4;
export const EVENT_WIN = 8;
export const EVENT_OVER = 16;
export const EVENT_PULSE = 32;

const TAU = Math.PI * 2;

function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }
function len(x, y) { return Math.hypot(x, y); }

export function createWorld(random) {
  // Two parallax layers: a dense far dust field and a smaller set of bright near stars.
  const stars = Array.from({ length: 210 }, (_, index) => {
    const far = index < 150;
    return {
      x: random() * FIELD.width,
      y: random() * FIELD.height,
      r: far ? randRange(random, 0.5, 1.5) : randRange(random, 1.0, 2.7),
      a: far ? randRange(random, 0.14, 0.48) : randRange(random, 0.42, 0.95),
      tw: randRange(random, 0.4, 2.6),
      par: far ? randRange(random, 0.12, 0.38) : randRange(random, 0.55, 1.1),
      layer: far ? 0 : 1,
    };
  });

  const motes = [];
  const rifts = [];
  const particles = [];

  const drone = { x: FIELD.cx, y: FIELD.cy + 220, vx: 0, vy: 0, inv: 0, hull: DRONE.hull };
  const core = { x: FIELD.cx, y: FIELD.cy, pulse: 0, charge: 0 };

  const state = {
    stars,
    drone,
    core,
    motes,
    rifts,
    particles,
    score: 0,
    phase: 1,
    time: 0,
    won: false,
    over: false,
    collectedTotal: 0,
    pulseCooldown: 0,
    endedAt: 0,
    finale: null,
  };

  function spawnParticle(x, y, color, count, speed, life) {
    for (let i = 0; i < count; i++) {
      if (particles.length >= PARTICLE_LIMIT) particles.shift();
      const a = random() * TAU;
      const s = speed * (0.3 + random() * 0.7);
      particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: life * (0.5 + random() * 0.7),
        max: life,
        r: randRange(random, 1.2, 3.5),
        color,
      });
    }
  }

  function spawnMote(edgeBias = false) {
    let x, y;
    if (edgeBias) {
      // Occasionally drift in from just inside the arena edge, so the field reads as a system.
      const side = Math.floor(random() * 4);
      const margin = 18;
      if (side === 0) { x = margin; y = randRange(random, 80, FIELD.height - 80); }
      else if (side === 1) { x = FIELD.width - margin; y = randRange(random, 80, FIELD.height - 80); }
      else if (side === 2) { x = randRange(random, 80, FIELD.width - 80); y = margin; }
      else { x = randRange(random, 80, FIELD.width - 80); y = FIELD.height - margin; }
    } else {
      // Most motes enter in a broad ring that is visible and reachable.
      let a = random() * TAU;
      let d = randRange(random, 210, 500);
      x = clamp(core.x + Math.cos(a) * d, 70, FIELD.width - 70);
      y = clamp(core.y + Math.sin(a) * d, 70, FIELD.height - 70);
      for (let tries = 0; tries < 6 && len(x - core.x, y - core.y) < 150; tries++) {
        a = random() * TAU;
        d = randRange(random, 210, 500);
        x = clamp(core.x + Math.cos(a) * d, 70, FIELD.width - 70);
        y = clamp(core.y + Math.sin(a) * d, 70, FIELD.height - 70);
      }
    }
    const tint = random();
    motes.push({
      x, y,
      vx: randRange(random, -MOTE.drift, MOTE.drift),
      vy: randRange(random, -MOTE.drift, MOTE.drift),
      r: MOTE.radius * randRange(random, 0.8, 1.25),
      hue: tint < 0.34 ? 0 : tint < 0.67 ? 1 : 2,
      spin: randRange(random, -2, 2),
      age: 0,
      trail: [{ x, y }],
      trailClock: randRange(random, 0, 0.12),
    });
  }

  function spawnRift() {
    const a = random() * TAU;
    const d = randRange(random, 420, 680);
    const x = clamp(core.x + Math.cos(a) * d, 60, FIELD.width - 60);
    const y = clamp(core.y + Math.sin(a) * d, 60, FIELD.height - 60);
    const dir = random() * TAU;
    const sp = RIFT.speedBase + RIFT.speedPerPhase * Math.min(state.phase - 1, 4);
    rifts.push({
      x, y,
      vx: Math.cos(dir) * sp,
      vy: Math.sin(dir) * sp,
      r: RIFT.radius * randRange(random, 0.9, 1.15),
      phase: random() * TAU,
    });
  }

  function ensurePopulation() {
    const wantMotes = MOTE.countBase + MOTE.countPerPhase * state.phase;
    while (motes.length < wantMotes) {
      const edgeBias = motes.length >= wantMotes - 2 && random() < 0.28;
      spawnMote(edgeBias);
    }
    const wantRifts = Math.min(7, RIFT.countBase + RIFT.countPerPhase * (state.phase - 1));
    while (rifts.length < wantRifts) spawnRift();
  }

  function reset() {
    motes.length = 0;
    rifts.length = 0;
    particles.length = 0;
    drone.x = FIELD.cx;
    drone.y = FIELD.cy + 240;
    drone.vx = 0; drone.vy = 0;
    drone.inv = 0; drone.hull = DRONE.hull;
    core.charge = 0; core.pulse = 0;
    state.score = 0;
    state.phase = 1;
    state.time = 0;
    state.won = false;
    state.over = false;
    state.collectedTotal = 0;
    state.pulseCooldown = 0;
    state.endedAt = 0;
    state.finale = null;
    for (let i = 0; i < MOTE.countBase + MOTE.countPerPhase; i++) spawnMote(false);
    for (let i = 0; i < RIFT.countBase; i++) spawnRift();
  }

  function applyField(entity, cx, cy, radius, strength, repel) {
    const dx = cx - entity.x;
    const dy = cy - entity.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > radius) return;
    const t = 1 - d / radius;
    const f = strength * t * t * (repel ? -1 : 1);
    entity.vx += (dx / d) * f;
    entity.vy += (dy / d) * f;
  }

  function step(dt, move, fieldMode, options = {}) {
    const { attract = false, repel = false } = fieldMode || {};
    const harmless = !!options.harmless;
    let events = 0;
    state.time += dt;
    core.pulse += dt;
    if (drone.inv > 0) drone.inv = Math.max(0, drone.inv - dt);
    if (state.pulseCooldown > 0) state.pulseCooldown = Math.max(0, state.pulseCooldown - dt);

    // Drone movement
    drone.vx += (move?.x || 0) * DRONE.accel * dt;
    drone.vy += (move?.y || 0) * DRONE.accel * dt;
    const ds = Math.hypot(drone.vx, drone.vy);
    if (ds > DRONE.speed) { drone.vx = drone.vx / ds * DRONE.speed; drone.vy = drone.vy / ds * DRONE.speed; }
    drone.vx *= DRONE.friction;
    drone.vy *= DRONE.friction;
    drone.x = clamp(drone.x + drone.vx * dt, DRONE.radius + 8, FIELD.width - DRONE.radius - 8);
    drone.y = clamp(drone.y + drone.vy * dt, DRONE.radius + 8, FIELD.height - DRONE.radius - 8);

    // Drone field pulse cue
    if ((attract || repel) && state.pulseCooldown === 0 && !state.over && !state.won) {
      state.pulseCooldown = 0.18;
      events |= EVENT_PULSE;
      spawnParticle(drone.x, drone.y, attract ? '#55ffd6' : '#ffd166', 4, 90, 0.25);
    }

    // Rifts update and affect things
    for (let i = 0; i < rifts.length; i++) {
      const r = rifts[i];
      r.phase += dt * 1.8;
      const toCoreX = core.x - r.x;
      const toCoreY = core.y - r.y;
      const td = Math.hypot(toCoreX, toCoreY) || 1;
      r.vx += (toCoreX / td) * RIFT.turnRate * 8 * dt + randRange(random, -20, 20) * dt;
      r.vy += (toCoreY / td) * RIFT.turnRate * 8 * dt + randRange(random, -20, 20) * dt;
      const sp = RIFT.speedBase + RIFT.speedPerPhase * Math.min(state.phase - 1, 4);
      const rs = Math.hypot(r.vx, r.vy) || 1;
      r.vx = r.vx / rs * sp; r.vy = r.vy / rs * sp;
      r.x += r.vx * dt; r.y += r.vy * dt;
      if (r.x < r.r || r.x > FIELD.width - r.r) r.vx *= -1;
      if (r.y < r.r || r.y > FIELD.height - r.r) r.vy *= -1;
      r.x = clamp(r.x, r.r, FIELD.width - r.r);
      r.y = clamp(r.y, r.r, FIELD.height - r.r);

      if (!harmless && !state.won && !state.over) {
        applyField(drone, r.x, r.y, RIFT.pullRadius, RIFT.pullStrength * dt, false);
      }
    }

    // Motes update
    for (let i = motes.length - 1; i >= 0; i--) {
      const m = motes[i];
      m.age += dt;
      applyField(m, core.x, core.y, CORE.pullRadius, CORE.pullStrength * dt, false);
      if (attract) applyField(m, drone.x, drone.y, DRONE.attractRadius, DRONE.attractForce * dt, false);
      if (repel) applyField(m, drone.x, drone.y, DRONE.repelRadius, DRONE.repelForce * dt, true);
      for (let j = 0; j < rifts.length; j++) applyField(m, rifts[j].x, rifts[j].y, rifts[j].r + 90, 180 * dt, false);

      m.vx *= MOTE.friction;
      m.vy *= MOTE.friction;
      const ms = Math.hypot(m.vx, m.vy);
      if (ms > MOTE.maxSpeed) { m.vx = m.vx / ms * MOTE.maxSpeed; m.vy = m.vy / ms * MOTE.maxSpeed; }
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.x < -40) m.x = FIELD.width + 30;
      if (m.x > FIELD.width + 40) m.x = -30;
      if (m.y < -40) m.y = FIELD.height + 30;
      if (m.y > FIELD.height + 40) m.y = -30;

      m.trail.push({ x: m.x, y: m.y });
      if (m.trail.length > MOTE.trailLength) m.trail.shift();
      m.trailClock += dt;
      if (!state.over && !state.won && m.trailClock > 0.16) {
        m.trailClock -= 0.16;
        const spark = m.hue === 0 ? '#55ffd6' : m.hue === 1 ? '#ffd166' : '#7cf7ff';
        spawnParticle(m.x, m.y, spark, 1, 16, 0.42);
      }

      const dc = Math.hypot(m.x - core.x, m.y - core.y);
      if (dc < CORE.collectRadius && !harmless) {
        motes.splice(i, 1);
        state.score += MOTE.value * state.phase;
        state.collectedTotal += 1;
        core.charge += CORE.chargePerMote;
        core.pulse += 0.8;
        events |= EVENT_COLLECT;
        spawnParticle(core.x + (m.x - core.x) * 0.3, core.y + (m.y - core.y) * 0.3, m.hue === 0 ? '#55ffd6' : m.hue === 1 ? '#ffd166' : '#7cf7ff', 10, 140, 0.45);
        continue;
      }
    }

    // Rift collisions with drone
    if (!harmless && !state.won && !state.over) {
      for (let i = 0; i < rifts.length; i++) {
        const r = rifts[i];
        const d = Math.hypot(drone.x - r.x, drone.y - r.y);
        if (d < drone.radius + r.r * 0.75 && drone.inv === 0) {
          drone.hull -= 1;
          drone.inv = DRONE.invulnerable;
          const nx = (drone.x - r.x) / (d || 1);
          const ny = (drone.y - r.y) / (d || 1);
          drone.vx += nx * 380;
          drone.vy += ny * 380;
          events |= EVENT_HIT;
          spawnParticle(drone.x, drone.y, '#ff4fd8', 18, 220, 0.5);
          spawnParticle(drone.x, drone.y, '#ffffff', 8, 180, 0.3);
          if (drone.hull <= 0) {
            state.over = true;
            state.endedAt = state.time;
            state.finale = { x: drone.x, y: drone.y, kind: 'over' };
            events |= EVENT_OVER;
            spawnParticle(drone.x, drone.y, '#ff5d8f', 48, 280, 1.0);
            spawnParticle(drone.x, drone.y, '#ff4fd8', 34, 230, 0.9);
            spawnParticle(drone.x, drone.y, '#fff3a6', 16, 190, 0.55);
          }
          break;
        }
      }
    }

    // Phase / win progression
    if (!harmless && !state.over && core.charge >= CORE.chargePerPhase) {
      core.charge -= CORE.chargePerPhase;
      if (state.phase < CORE.maxPhase) {
        state.phase += 1;
        events |= EVENT_PHASE;
        spawnParticle(core.x, core.y, '#53fff1', 30, 220, 0.7);
        spawnParticle(core.x, core.y, '#fff3a6', 16, 160, 0.5);
        ensurePopulation();
      } else if (!state.won) {
        state.won = true;
        state.endedAt = state.time;
        state.finale = { x: core.x, y: core.y, kind: 'win' };
        state.score += 500;
        events |= EVENT_WIN;
        spawnParticle(core.x, core.y, '#fff3a6', 60, 260, 1.0);
        spawnParticle(core.x, core.y, '#53fff1', 40, 220, 0.9);
      }
    }

    ensurePopulation();

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
    }

    return events;
  }

  reset();
  return { state, reset, step, spawnParticle };
}
