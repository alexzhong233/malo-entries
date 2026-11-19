(function (SB) {
  'use strict';

  var TAU = Math.PI * 2;
  var U = {
    TAU: TAU,
    clamp: function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    damp: function (a, b, rate, dt) { return U.lerp(a, b, 1 - Math.exp(-rate * dt)); },
    smooth: function (t) { t = U.clamp(t, 0, 1); return t * t * (3 - 2 * t); },
    dist: function (ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); },
    dist2: function (ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; },
    len: function (x, y) { return Math.hypot(x, y); },
    angleDelta: function (a, b) {
      var d = (b - a + Math.PI) % TAU;
      if (d < 0) d += TAU;
      return d - Math.PI;
    },
    angleLerp: function (a, b, t) { return a + U.angleDelta(a, b) * t; },
    approach: function (v, target, step) {
      if (v < target) return Math.min(v + step, target);
      return Math.max(v - step, target);
    },
    pick: function (rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; },
    range: function (rng, a, b) { return a + rng() * (b - a); },
    sign: function (v) { return v < 0 ? -1 : 1; },

    // Deterministic 32-bit PRNG, handy for repeatable city generation.
    rng: function (seed) {
      var s = seed >>> 0;
      return function () {
        s += 0x6d2b79f5;
        var t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    hash2: function (x, y) {
      var n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      return n - Math.floor(n);
    },

    circleRect: function (cx, cy, r, x, y, w, h) {
      var qx = U.clamp(cx, x, x + w), qy = U.clamp(cy, y, y + h);
      return U.dist2(cx, cy, qx, qy) < r * r;
    },

    // Slab test: does a segment pass through an axis-aligned rectangle?
    segmentRect: function (x1, y1, x2, y2, rx, ry, rw, rh) {
      var dx = x2 - x1, dy = y2 - y1;
      var tmin = 0, tmax = 1;
      var p = [-dx, dx, -dy, dy];
      var q = [x1 - rx, rx + rw - x1, y1 - ry, ry + rh - y1];
      for (var i = 0; i < 4; i++) {
        if (Math.abs(p[i]) < 1e-9) { if (q[i] < 0) return false; }
        else {
          var t = q[i] / p[i];
          if (p[i] < 0) { if (t > tmax) return false; if (t > tmin) tmin = t; }
          else { if (t < tmin) return false; if (t < tmax) tmax = t; }
        }
      }
      return true;
    },

    distToSegment: function (px, py, ax, ay, bx, by) {
      var dx = bx - ax, dy = by - ay;
      var l2 = dx * dx + dy * dy;
      if (l2 < 1e-6) return U.dist(px, py, ax, ay);
      var t = U.clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
      return U.dist(px, py, ax + dx * t, ay + dy * t);
    },

    roundRect: function (ctx, x, y, w, h, r) {
      r = Math.min(r, w * 0.5, h * 0.5);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    },

    // Lighten/darken a #rrggbb colour. Amount is -1..1.
    shade: function (hex, amount) {
      var n = parseInt(hex.slice(1), 16);
      var f = function (v) { return Math.round(U.clamp(v + 255 * amount, 0, 255)); };
      var r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
      return 'rgb(' + r + ',' + g + ',' + b + ')';
    },

    cash: function (n) { return '$' + Math.floor(n).toLocaleString('en-US'); },
    clock: function (hour) {
      var h = Math.floor(hour) % 24, m = Math.floor((hour % 1) * 60);
      return (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? ' AM' : ' PM');
    }
  };

  SB.U = U;
})(window.SB = window.SB || {});
