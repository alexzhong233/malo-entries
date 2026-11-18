// Rendering for STAR SIPHON. Draws the nebula backdrop, core, rifts, motes, drone, particles, HUD, panels.
// Fixed 1600x900 logical space scaled/letterboxed to canvas.

import { CORE, DRONE, FIELD, FONT, PALETTE } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const TAU = Math.PI * 2;

function withAlpha(hex, a) {
  if (!hex.startsWith('#')) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function moteColor(hue) {
  return hue === 0 ? PALETTE.moteA : hue === 1 ? PALETTE.moteB : PALETTE.moteC;
}

function roundedPath(ctx, x, y, w, h, rad) {
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, w: 0, h: 0 };
  let animClock = 0;
  let lastNow = performance.now();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const w = Math.round(window.innerWidth * ratio);
    const h = Math.round(window.innerHeight * ratio);
    canvas.width = w;
    canvas.height = h;
    view.scale = Math.min(w / FIELD.width, h / FIELD.height);
    view.w = FIELD.width * view.scale;
    view.h = FIELD.height * view.scale;
    view.x = (w - view.w) / 2;
    view.y = (h - view.h) / 2;
  }

  function font(size, weight = 600) {
    ctx.font = `${weight} ${size}px ${FONT}`;
  }

  function text(str, x, y, size, color, align = 'left', weight = 600, baseline = 'alphabetic') {
    font(size, weight);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(str, x, y);
  }

  function glowText(str, x, y, size, color, align, weight, baseline, glow) {
    ctx.save();
    ctx.shadowColor = glow || withAlpha(color.startsWith('#') ? color : '#ffffff', 0.8);
    ctx.shadowBlur = 20;
    text(str, x, y, size, color, align, weight, baseline);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Background: deep-blue to dark-violet nebula, two drifting cloud layers and a
  // two-layer parallax star / dust field.
  // ---------------------------------------------------------------------------

  function drawNebulaBlobs(t) {
    const spanW = FIELD.width;
    const spanH = FIELD.height;
    const far = [
      { x: 0.16, y: 0.20, r: 0.46, c: PALETTE.nebulaBlue, a: 0.19, ph: 0.0, sp: 0.030 },
      { x: 0.82, y: 0.28, r: 0.40, c: PALETTE.nebulaTeal, a: 0.11, ph: 1.7, sp: 0.024 },
      { x: 0.54, y: 0.82, r: 0.48, c: PALETTE.nebulaPink, a: 0.10, ph: 3.1, sp: 0.020 },
      { x: 0.12, y: 0.86, r: 0.38, c: PALETTE.nebulaViolet, a: 0.15, ph: 4.4, sp: 0.027 },
      { x: 0.92, y: 0.74, r: 0.34, c: PALETTE.nebulaBlue, a: 0.12, ph: 5.2, sp: 0.018 },
    ];
    const near = [
      { x: 0.68, y: 0.60, r: 0.24, c: PALETTE.nebulaPink, a: 0.15, ph: 2.2, sp: 0.075 },
      { x: 0.30, y: 0.34, r: 0.28, c: PALETTE.nebulaTeal, a: 0.11, ph: 4.8, sp: 0.065 },
      { x: 0.86, y: 0.84, r: 0.22, c: PALETTE.nebulaBlue, a: 0.16, ph: 0.9, sp: 0.080 },
    ];

    for (const n of far) {
      const x = n.x * spanW + Math.sin(t * n.sp + n.ph) * spanW * 0.045;
      const y = n.y * spanH + Math.cos(t * n.sp * 0.8 + n.ph) * spanH * 0.035;
      const r = n.r * spanW;
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, withAlpha(n.c, n.a));
      rg.addColorStop(0.45, withAlpha(n.c, n.a * 0.36));
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }

    // A long galactic band, tilted across the middle of the field.
    ctx.save();
    ctx.translate(spanW * 0.52, spanH * 0.54);
    ctx.rotate(-0.44);
    const band = ctx.createLinearGradient(0, -228, 0, 228);
    band.addColorStop(0, 'rgba(0,0,0,0)');
    band.addColorStop(0.42, withAlpha(PALETTE.nebulaViolet, 0.10));
    band.addColorStop(0.56, withAlpha(PALETTE.nebulaBlue, 0.12));
    band.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = band;
    ctx.fillRect(-spanW, -228, spanW * 2, 456);
    ctx.restore();

    for (const n of near) {
      const x = n.x * spanW + Math.sin(t * n.sp + n.ph) * spanW * 0.075;
      const y = n.y * spanH + Math.cos(t * n.sp * 0.7 + n.ph) * spanH * 0.060;
      const r = n.r * spanW;
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, withAlpha(n.c, n.a));
      rg.addColorStop(0.40, withAlpha(n.c, n.a * 0.32));
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
  }

  function drawStars(state, t) {
    const spanW = FIELD.width + 40;
    const spanH = FIELD.height + 40;
    for (const s of state.stars) {
      const px = ((s.x + t * 13 * s.par) % spanW + spanW) % spanW - 20;
      const py = ((s.y + Math.sin(t * 0.18 + s.x * 0.013) * 8 * s.par) % spanH + spanH) % spanH - 20;
      const tw = 0.5 + 0.5 * Math.sin(t * s.tw + s.x * 0.02);
      const a = s.a * (0.45 + 0.55 * tw);
      const tint = s.layer === 0 ? '205,226,255' : (s.x % 2 > 1 ? '255,232,202' : '196,246,255');
      ctx.fillStyle = `rgba(${tint},${a})`;
      ctx.beginPath();
      ctx.arc(px, py, s.r, 0, TAU);
      ctx.fill();

      if (s.layer === 1 && s.r > 1.9) {
        const flare = s.r * 3.6;
        ctx.strokeStyle = `rgba(${tint},${a * 0.40})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(px - flare, py); ctx.lineTo(px + flare, py);
        ctx.moveTo(px, py - flare); ctx.lineTo(px, py + flare);
        ctx.stroke();
      }
    }
  }

  function drawBackground(state, t) {
    const g = ctx.createLinearGradient(0, 0, FIELD.width * 0.55, FIELD.height);
    g.addColorStop(0, PALETTE.bg0);
    g.addColorStop(0.42, PALETTE.bg1);
    g.addColorStop(0.76, PALETTE.bg2);
    g.addColorStop(1, PALETTE.bg3);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawNebulaBlobs(t);
    ctx.restore();

    // A faint tactical grid drifts behind everything, giving the starfield scale.
    ctx.save();
    ctx.strokeStyle = PALETTE.grid;
    ctx.lineWidth = 1;
    const step = 88;
    const ox = (t * 7) % step;
    const oy = (t * 5) % step;
    for (let x = -step; x <= FIELD.width + step; x += step) {
      ctx.beginPath(); ctx.moveTo(x + ox, 0); ctx.lineTo(x + ox, FIELD.height); ctx.stroke();
    }
    for (let y = -step; y <= FIELD.height + step; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y + oy); ctx.lineTo(FIELD.width, y + oy); ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawStars(state, t);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Core, rifts, siphon links, motes and drone.
  // ---------------------------------------------------------------------------

  function drawCore(state, t, fieldMode) {
    const c = state.core;
    const attract = !!fieldMode?.attract;
    const chargeFrac = Math.max(0, Math.min(1, c.charge / CORE.chargePerPhase));
    const pulse = 1 + Math.sin(t * 2.2) * 0.05 + Math.min(0.28, c.pulse * 0.03);
    const r = CORE.radius * pulse;

    // Siphon ripples travel out from the core; they brighten while the drone attracts.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const ringSpeed = attract ? 0.55 : 0.32;
    const ringReach = attract ? 200 : 132;
    for (let i = 0; i < 4; i++) {
      const p = (t * ringSpeed + i / 4) % 1;
      const radius = CORE.collectRadius + p * ringReach;
      const alpha = (1 - p) * (attract ? 0.38 : 0.15) * (0.65 + chargeFrac * 0.55);
      ctx.strokeStyle = withAlpha(PALETTE.core, alpha);
      ctx.lineWidth = 0.7 + (1 - p) * 2.2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, radius, 0, TAU);
      ctx.stroke();
    }
    if (attract) {
      ctx.translate(c.x, c.y);
      ctx.rotate(-t * 1.1);
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = withAlpha(i === 1 ? PALETTE.coreHot : PALETTE.core, 0.32);
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(0, 0, r + 58 + i * 16, i * 2.1, i * 2.1 + 1.35);
        ctx.stroke();
      }
    }
    ctx.restore();

    const rg = ctx.createRadialGradient(c.x, c.y, r * 0.1, c.x, c.y, r * 2.7);
    rg.addColorStop(0, withAlpha(PALETTE.coreHot, 0.97));
    rg.addColorStop(0.25, withAlpha(PALETTE.core, 0.86));
    rg.addColorStop(0.55, withAlpha(PALETTE.core2, 0.28));
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(c.x, c.y, r * 2.7, 0, TAU); ctx.fill();

    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(t * 0.5);
    ctx.strokeStyle = withAlpha(PALETTE.core, 0.45);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r + 18, 0, TAU); ctx.stroke();
    ctx.strokeStyle = withAlpha(PALETTE.coreHot, 0.28);
    ctx.beginPath(); ctx.arc(0, 0, r + 30, 0.8, 0.8 + Math.PI * 1.3); ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const a = (TAU / 4) * i + t * 0.3;
      ctx.fillStyle = i % 2 ? PALETTE.core : PALETTE.coreHot;
      ctx.beginPath(); ctx.arc(Math.cos(a) * (r + 18), Math.sin(a) * (r + 18), 3.5, 0, TAU); ctx.fill();
    }
    ctx.restore();

    const body = ctx.createRadialGradient(c.x - r * 0.25, c.y - r * 0.3, r * 0.2, c.x, c.y, r);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.35, PALETTE.coreHot);
    body.addColorStop(1, PALETTE.core2);
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = withAlpha('#ffffff', 0.60);
    ctx.lineWidth = 2;
    ctx.stroke();

    // Energy ticks around the rim show accumulated charge.
    ctx.save();
    ctx.translate(c.x, c.y);
    for (let i = 0; i < 20; i++) {
      const lit = i < Math.round(chargeFrac * 20);
      const a = (TAU / 20) * i + t * 0.18;
      ctx.strokeStyle = withAlpha(lit ? PALETTE.coreHot : PALETTE.core2, lit ? 0.75 : 0.22);
      ctx.lineWidth = lit ? 2.5 : 1.2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (r + 38), Math.sin(a) * (r + 38));
      ctx.lineTo(Math.cos(a) * (r + 44), Math.sin(a) * (r + 44));
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSiphonLinks(state, t) {
    const c = state.core;
    const reach = CORE.pullRadius + 150;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const m of state.motes) {
      const d = Math.hypot(m.x - c.x, m.y - c.y);
      if (d > reach || d < CORE.collectRadius) continue;
      const alpha = (1 - d / reach) * 0.34;
      const grad = ctx.createLinearGradient(m.x, m.y, c.x, c.y);
      grad.addColorStop(0, withAlpha(moteColor(m.hue), alpha));
      grad.addColorStop(0.65, withAlpha(PALETTE.core, alpha * 0.35));
      grad.addColorStop(1, withAlpha(PALETTE.core, 0));
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(c.x, c.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRift(r, t) {
    const pulse = 1 + Math.sin(t * 3 + r.phase) * 0.08;
    const radius = r.r * pulse;
    const haze = ctx.createRadialGradient(r.x, r.y, radius * 0.2, r.x, r.y, radius * 2.4);
    haze.addColorStop(0, 'rgba(20,0,30,0.9)');
    haze.addColorStop(0.4, withAlpha(PALETTE.rift, 0.20));
    haze.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = haze;
    ctx.beginPath(); ctx.arc(r.x, r.y, radius * 2.4, 0, TAU); ctx.fill();

    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(t * 1.6 + r.phase);
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(255,90,220,${0.20 + i * 0.09})`;
      ctx.lineWidth = 2 + i;
      ctx.beginPath();
      ctx.arc(0, 0, radius + 8 + i * 7, i * 1.3, i * 1.3 + Math.PI * 1.1);
      ctx.stroke();
    }
    ctx.restore();

    const hole = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, radius);
    hole.addColorStop(0, '#000000');
    hole.addColorStop(0.7, PALETTE.riftCore);
    hole.addColorStop(1, withAlpha(PALETTE.rift, 0.65));
    ctx.fillStyle = hole;
    ctx.beginPath(); ctx.arc(r.x, r.y, radius, 0, TAU); ctx.fill();
    ctx.strokeStyle = withAlpha('#ff9ae8', 0.62);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawMote(m, t) {
    const c = moteColor(m.hue);
    const bob = Math.sin(t * 4 + m.age * 3 + m.x * 0.01) * 1.5;
    const r = m.r + bob * 0.12;
    const trail = m.trail || [];

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Soft ion trail left behind the mote.
    for (let i = 0; i < trail.length - 1; i++) {
      const p = trail[i];
      const k = (i + 1) / trail.length;
      const a = 0.03 + 0.32 * k * k;
      const rr = r * (0.14 + 0.68 * k);
      ctx.fillStyle = withAlpha(c, a);
      ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, TAU); ctx.fill();
    }

    const glow = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, r * 2.8);
    glow.addColorStop(0, withAlpha(c, 0.62));
    glow.addColorStop(0.4, withAlpha(c, 0.22));
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(m.x, m.y, r * 2.8, 0, TAU); ctx.fill();

    // Two tiny satellites orbiting each mote.
    for (let i = 0; i < 2; i++) {
      const a = t * 2.4 + m.age * 1.6 + i * Math.PI;
      const orbit = r * (1.8 + i * 0.5);
      ctx.fillStyle = withAlpha(i === 0 ? '#ffffff' : c, 0.55);
      ctx.beginPath();
      ctx.arc(m.x + Math.cos(a) * orbit, m.y + Math.sin(a) * orbit, 1.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(t * m.spin + m.age);
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.85, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r * 0.85, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = withAlpha('#ffffff', 0.72);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = withAlpha('#ffffff', 0.72);
    ctx.beginPath(); ctx.arc(-r * 0.15, -r * 0.15, r * 0.24, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawDrone(state, t, fieldMode) {
    const d = state.drone;
    const blink = d.inv > 0 && Math.floor(d.inv * 12) % 2 === 0;
    const angle = Math.atan2(d.vy, d.vx || 0.0001);

    if (fieldMode?.attract || fieldMode?.repel) {
      const radius = fieldMode.attract ? DRONE.attractRadius : DRONE.repelRadius;
      const col = fieldMode.attract ? PALETTE.attract : PALETTE.repel;
      const aura = ctx.createRadialGradient(d.x, d.y, 10, d.x, d.y, radius);
      aura.addColorStop(0, col);
      aura.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = aura;
      ctx.beginPath(); ctx.arc(d.x, d.y, radius, 0, TAU); ctx.fill();
      ctx.strokeStyle = fieldMode.attract ? withAlpha(PALETTE.moteA, 0.42) : withAlpha(PALETTE.moteB, 0.42);
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 10]);
      ctx.beginPath(); ctx.arc(d.x, d.y, radius * (0.93 + 0.04 * Math.sin(t * 8)), 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }

    if (blink) return;
    const glow = ctx.createRadialGradient(d.x, d.y, 2, d.x, d.y, 38);
    glow.addColorStop(0, withAlpha(PALETTE.droneGlow, 0.62));
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(d.x, d.y, 38, 0, TAU); ctx.fill();

    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(angle);
    const thrust = Math.min(1, Math.hypot(d.vx, d.vy) / DRONE.speed);
    if (thrust > 0.05) {
      ctx.fillStyle = withAlpha(PALETTE.droneGlow, 0.5 + thrust * 0.3);
      ctx.beginPath();
      ctx.moveTo(-14, -4);
      ctx.lineTo(-14 - thrust * 16 - Math.sin(t * 30) * 3, 0);
      ctx.lineTo(-14, 4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = PALETTE.drone;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-10, -12);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-10, 12);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = withAlpha(PALETTE.droneGlow, 0.9);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = PALETTE.droneGlow;
    ctx.beginPath(); ctx.arc(2, 0, 3, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawParticles(state) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of state.particles) {
      const a = Math.max(0, p.life / p.max);
      const col = p.color.startsWith('#') ? withAlpha(p.color, a * 0.9) : p.color;
      const streak = 0.045;
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(0.6, p.r * 0.8);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * streak, p.y - p.vy * streak);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.4 + a), 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // Persistent embers and shockwave rings keep the end screen alive.
  function drawAfterglow(state, t) {
    const f = state.finale;
    if (!f) return;
    const isWin = f.kind === 'win';
    const main = isWin ? PALETTE.coreHot : PALETTE.rift;
    const second = isWin ? PALETTE.core : PALETTE.danger;
    const age = Math.max(0, t - state.endedAt);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < 72; i++) {
      const baseX = (i * 127.13 + 53) % FIELD.width;
      const baseY = (i * 311.77 + 31) % FIELD.height;
      const y = (baseY - age * (8 + (i % 7) * 2) + FIELD.height * 4) % FIELD.height;
      const x = (baseX + Math.sin(t * 0.22 + i * 1.7) * 16 + FIELD.width) % FIELD.width;
      const alpha = 0.08 + 0.16 * (0.5 + 0.5 * Math.sin(t * 1.3 + i * 2.1));
      ctx.fillStyle = withAlpha(i % 5 === 0 ? second : main, alpha);
      ctx.beginPath(); ctx.arc(x, y, 1.1 + (i % 3) * 0.7, 0, TAU); ctx.fill();
    }

    const halo = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 260);
    halo.addColorStop(0, withAlpha(main, 0.22));
    halo.addColorStop(0.4, withAlpha(second, 0.10));
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(f.x, f.y, 260, 0, TAU); ctx.fill();

    for (let i = 0; i < 4; i++) {
      const p = (age * 0.42 + i / 4) % 1;
      const radius = 26 + p * 330;
      ctx.strokeStyle = withAlpha(i % 2 ? main : second, (1 - p) * 0.30);
      ctx.lineWidth = 0.8 + (1 - p) * 2.8;
      ctx.beginPath(); ctx.arc(f.x, f.y, radius, 0, TAU); ctx.stroke();
    }

    for (let i = 0; i < 40; i++) {
      const a = i * 2.399963;
      const rr = 42 + ((i * 37) % 250);
      const rise = (age * (16 + (i % 5) * 6) + i * 11) % 190;
      const ex = f.x + Math.cos(a) * rr * (0.7 + 0.3 * Math.sin(i * 1.3));
      const ey = f.y + Math.sin(a) * rr * 0.62 - rise * 0.45;
      ctx.fillStyle = withAlpha(i % 3 === 0 ? second : main, 0.28 + 0.25 * Math.sin(t + i));
      ctx.beginPath(); ctx.arc(ex, ey, 1.2 + (i % 4) * 0.55, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // HUD and modal panels.
  // ---------------------------------------------------------------------------

  function drawHud(state, fieldMode) {
    const top = 16;
    const panelH = 64;
    const bg = ctx.createLinearGradient(0, top, 0, top + panelH);
    bg.addColorStop(0, 'rgba(11,24,50,0.82)');
    bg.addColorStop(1, 'rgba(5,10,28,0.66)');
    ctx.fillStyle = bg;
    ctx.fillRect(20, top, FIELD.width - 40, panelH);
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(20, top, FIELD.width - 40, panelH);

    const accent = ctx.createLinearGradient(20, 0, FIELD.width - 20, 0);
    accent.addColorStop(0, withAlpha(PALETTE.core, 0.75));
    accent.addColorStop(0.5, withAlpha(PALETTE.moteB, 0.55));
    accent.addColorStop(1, withAlpha(PALETTE.rift, 0.65));
    ctx.fillStyle = accent;
    ctx.fillRect(20, top, FIELD.width - 40, 2);

    // Left: score.
    text('SCORE', 46, 35, 13, PALETTE.muted, 'left', 700, 'middle');
    text(String(state.score).padStart(5, '0'), 46, 59, 28, PALETTE.text, 'left', 800, 'middle');

    // Center: phase and its five charge pips.
    const phaseColor = state.won ? PALETTE.coreHot : PALETTE.moteC;
    text(`PHASE ${state.phase} / ${CORE.maxPhase}`, FIELD.width / 2, 38, 23, phaseColor, 'center', 800, 'middle');
    const pipW = 28, pipGap = 8;
    const pipTotal = CORE.maxPhase * pipW + (CORE.maxPhase - 1) * pipGap;
    let pipX = FIELD.width / 2 - pipTotal / 2;
    for (let i = 0; i < CORE.maxPhase; i++) {
      const active = state.won || i < state.phase;
      ctx.fillStyle = active ? withAlpha(PALETTE.core, 0.9) : 'rgba(120,160,210,0.20)';
      ctx.fillRect(pipX, 57, pipW, 4);
      pipX += pipW + pipGap;
    }

    // Right: HULL label with explicit spacing from its three hearts.
    font(20, 800);
    const labelW = ctx.measureText('HULL').width;
    const gap = 18;
    const slot = 34;
    const hullW = 22;
    const groupW = labelW + gap + (DRONE.hull - 1) * slot + hullW;
    const labelX = FIELD.width - 46 - groupW;
    text('HULL', labelX, 48, 20, PALETTE.muted, 'left', 800, 'middle');
    for (let i = 0; i < DRONE.hull; i++) {
      const hx = labelX + labelW + gap + hullW / 2 + i * slot;
      const alive = i < state.drone.hull;
      if (alive) {
        const hg = ctx.createRadialGradient(hx, 47, 0, hx, 47, 22);
        hg.addColorStop(0, withAlpha(PALETTE.danger, 0.42));
        hg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.arc(hx, 47, 22, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = alive ? PALETTE.danger : 'rgba(120,140,170,0.22)';
      ctx.beginPath();
      ctx.moveTo(hx, 36);
      ctx.lineTo(hx + 10, 45);
      ctx.lineTo(hx, 60);
      ctx.lineTo(hx - 10, 45);
      ctx.closePath();
      ctx.fill();
      if (alive) {
        ctx.strokeStyle = withAlpha('#ffffff', 0.48);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Charge bar under the top strip.
    const barW = 440, barH = 12;
    const barX = FIELD.width / 2 - barW / 2;
    const barY = 94;
    const frac = state.won ? 1 : Math.max(0, Math.min(1, state.core.charge / CORE.chargePerPhase));
    ctx.fillStyle = 'rgba(8,16,36,0.80)';
    ctx.fillRect(barX, barY, barW, barH);
    for (let i = 1; i < 10; i++) {
      ctx.fillStyle = 'rgba(130,170,220,0.12)';
      ctx.fillRect(barX + (barW / 10) * i, barY + 1, 1, barH - 2);
    }
    const cg = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    cg.addColorStop(0, PALETTE.core2);
    cg.addColorStop(0.55, PALETTE.core);
    cg.addColorStop(1, PALETTE.coreHot);
    ctx.fillStyle = cg;
    ctx.fillRect(barX, barY, barW * frac, barH);
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.strokeRect(barX, barY, barW, barH);
    if (frac > 0.02) {
      ctx.save();
      ctx.shadowColor = withAlpha(PALETTE.core, 0.8);
      ctx.shadowBlur = 14;
      ctx.fillStyle = withAlpha(PALETTE.core, 0.55);
      ctx.fillRect(barX + barW * frac - 3, barY - 2, 3, barH + 4);
      ctx.restore();
    }
    text(state.won ? 'CORE STABILIZED' : 'CORE CHARGE', barX, 122, 14, PALETTE.muted, 'left', 700, 'middle');
    text(`${Math.round(frac * 100)}%`, barX + barW, 122, 14, state.won ? PALETTE.coreHot : PALETTE.text, 'right', 800, 'middle');

    // Controls hint.
    ctx.fillStyle = 'rgba(5,12,30,0.50)';
    ctx.fillRect(20, FIELD.height - 44, 700, 28);
    ctx.strokeStyle = 'rgba(120,180,255,0.16)';
    ctx.strokeRect(20, FIELD.height - 44, 700, 28);
    text('WASD / ARROWS  MOVE     LMB  ATTRACT     RMB / SHIFT  REPEL     P  PAUSE', 34, FIELD.height - 22, 15, PALETTE.muted, 'left', 600, 'middle');
  }

  function drawPanel(title, color, lines, prompt, pulsePhase, subtitle) {
    const w = 840;
    const lineH = 32;
    const h = 170 + lines.length * lineH + 70;
    const x = (FIELD.width - w) / 2;
    const y = (FIELD.height - h) / 2;

    ctx.save();
    const aura = ctx.createRadialGradient(FIELD.width / 2, y + h * 0.45, 20, FIELD.width / 2, y + h * 0.45, w * 0.72);
    aura.addColorStop(0, withAlpha(color, 0.15));
    aura.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = aura;
    ctx.fillRect(x - 120, y - 120, w + 240, h + 240);

    roundedPath(ctx, x, y, w, h, 18);
    ctx.fillStyle = PALETTE.panel;
    ctx.fill();
    ctx.strokeStyle = withAlpha(color, 0.55);
    ctx.lineWidth = 2;
    ctx.stroke();

    const glow = ctx.createLinearGradient(x, y, x, y + 150);
    glow.addColorStop(0, withAlpha(color, 0.22));
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fill();

    // Corner brackets.
    ctx.strokeStyle = withAlpha(color, 0.9);
    ctx.lineWidth = 2;
    const bracket = 22;
    for (const [cx, cy, sx, sy] of [[x + 16, y + 16, 1, 1], [x + w - 16, y + 16, -1, 1], [x + 16, y + h - 16, 1, -1], [x + w - 16, y + h - 16, -1, -1]]) {
      ctx.beginPath();
      ctx.moveTo(cx, cy + bracket * sy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + bracket * sx, cy);
      ctx.stroke();
    }

    // Small top diamond marker.
    ctx.save();
    ctx.translate(FIELD.width / 2, y + 29);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = withAlpha(color, 0.9);
    ctx.fillRect(-4, -4, 8, 8);
    ctx.restore();

    glowText(title, FIELD.width / 2, y + 84, 62, color, 'center', 800, 'middle', withAlpha(color, 0.75));
    if (subtitle) {
      text(subtitle, FIELD.width / 2, y + 125, 18, PALETTE.muted, 'center', 700, 'middle');
    }

    const div = ctx.createLinearGradient(x + 70, 0, x + w - 70, 0);
    div.addColorStop(0, 'rgba(0,0,0,0)');
    div.addColorStop(0.5, withAlpha(color, 0.55));
    div.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = div;
    ctx.fillRect(x + 70, y + 148, w - 140, 1);

    let ly = y + 186;
    for (const line of lines) {
      text(line, FIELD.width / 2, ly, 23, PALETTE.text, 'center', 500, 'middle');
      ly += lineH;
    }

    const pulse = 0.7 + 0.3 * Math.sin(pulsePhase);
    text(prompt, FIELD.width / 2, y + h - 38, 25, withAlpha(PALETTE.moteB, pulse), 'center', 700, 'middle');
    ctx.restore();
  }

  function draw(state, screen, best, fieldMode, opts = {}) {
    const deterministic = !!opts.deterministic;
    let pulsePhase = 1.2;
    let t = state.time;
    if (deterministic) {
      pulsePhase = typeof opts.pulsePhase === 'number' ? opts.pulsePhase : 1.2;
      t = state.time + (opts.animOffset || 0);
    } else {
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
      lastNow = now;
      animClock += dt;
      pulsePhase = now / 300;
      t = state.time + animClock * 0.15; // keep subtle motion even when sim paused
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const edge = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    edge.addColorStop(0, PALETTE.bg0);
    edge.addColorStop(0.55, PALETTE.bg1);
    edge.addColorStop(1, PALETTE.bg3);
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, FIELD.width, FIELD.height);
    ctx.clip();

    drawBackground(state, t);
    drawAfterglow(state, t);
    drawCore(state, t, fieldMode);
    drawSiphonLinks(state, t);
    for (const r of state.rifts) drawRift(r, t);
    for (const m of state.motes) drawMote(m, t);
    drawParticles(state);
    drawDrone(state, t, fieldMode || { attract: false, repel: false });
    drawHud(state, fieldMode);

    if (screen === SCREEN_TITLE) {
      drawPanel('STAR SIPHON', PALETTE.core, [
        'Pilot a siphon drone. Herd glowing energy motes into the Stellar Core.',
        'Hold Left Mouse to ATTRACT. Right Mouse or Shift to REPEL.',
        'Avoid Void Rifts. Charge all 5 phases to stabilize the star.',
        best > 0 ? `Best Score: ${best}` : 'Can you calm the collapsing starfield?',
      ], 'Press Space or Click to Launch', pulsePhase, 'HERD THE LIGHT. OUTRUN THE VOID.');
    } else if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', PALETTE.moteC, [
        `Score ${state.score}   •   Phase ${state.phase} / ${CORE.maxPhase}   •   Hull ${state.drone.hull}`,
        'The rifts still churn. Resume when ready.',
      ], 'Press P to Resume', pulsePhase, 'SIGNAL HELD // FLIGHT SUSPENDED');
    } else if (screen === SCREEN_OVER) {
      drawPanel('CORE LOST', PALETTE.danger, [
        `Final Score: ${state.score}`,
        `Phase Reached: ${state.phase} / ${CORE.maxPhase}`,
        `Motes Siphoned: ${state.collectedTotal}`,
        `Best Score: ${Math.max(best, state.score)}`,
      ], 'Press Space or Click to Try Again', pulsePhase, 'RUN TERMINATED // SIGNAL LOST');
    } else if (screen === SCREEN_WIN) {
      drawPanel('STAR STABILIZED', PALETTE.coreHot, [
        `Final Score: ${state.score}`,
        `Phases Stabilized: ${CORE.maxPhase} / ${CORE.maxPhase}`,
        `Motes Siphoned: ${state.collectedTotal}`,
        'The void rifts fade as the core ignites in harmony.',
      ], 'Press Space or Click to Play Again', pulsePhase, 'ALL PHASES ALIGNED');
    }

    ctx.restore();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const vg = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, Math.min(view.w, view.h) * 0.28, canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.40)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, resize, view };
}
