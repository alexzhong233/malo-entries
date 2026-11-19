/* SOLARA BAY - small math, RNG and geometry helpers. */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});

  const TAU = Math.PI * 2;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(a, b, t) {
    const x = clamp((t - a) / (b - a || 1), 0, 1);
    return x * x * (3 - 2 * x);
  }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
  function normAngle(a) {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  }
  function approach(a, b, t) { return a + normAngle(b - a) * clamp(t, 0, 1); }
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }

  // Deterministic, tiny PRNG so the city and traffic are identical every run.
  function makeRng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function circleRect(cx, cy, r, rect) {
    const nx = clamp(cx, rect.x, rect.x + rect.w);
    const ny = clamp(cy, rect.y, rect.y + rect.h);
    return dist2(cx, cy, nx, ny) < r * r;
  }
  function pointRect(x, y, rect) {
    return x >= rect.x && y >= rect.y && x <= rect.x + rect.w && y <= rect.y + rect.h;
  }
  function money(n) { return '$' + Math.max(0, Math.floor(n)).toLocaleString('en-US'); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function shade(hex, amt) {
    const h = hex.replace('#', '');
    let r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    r = clamp(Math.round(r + amt), 0, 255);
    g = clamp(Math.round(g + amt), 0, 255);
    b = clamp(Math.round(b + amt), 0, 255);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function starPath(ctx, x, y, outer, inner) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const r = i % 2 ? inner : outer;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  SB.U = {
    TAU: TAU, clamp: clamp, lerp: lerp, smooth: smooth, dist: dist, dist2: dist2,
    normAngle: normAngle, approach: approach, pick: pick, makeRng: makeRng, hash: hash,
    circleRect: circleRect, pointRect: pointRect, money: money, pad: pad,
    shade: shade, starPath: starPath
  };
})();
