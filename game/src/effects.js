/* SOLARA BAY - particles, tire marks, muzzle flashes and screen shake. */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const U = SB.U;

  const particles = [];
  const marks = [];
  const flashes = [];
  const MAX_PARTICLES = 900;
  let shake = 0;

  function add(type, x, y, vx, vy, life, r, color) {
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push({ type: type, x: x, y: y, vx: vx, vy: vy, life: life, max: life, r: r, color: color });
  }

  function burst(x, y, n, color, speed, type) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * U.TAU, s = speed * (0.3 + Math.random() * 0.8);
      add(type || 'spark', x, y, Math.cos(a) * s, Math.sin(a) * s,
        0.25 + Math.random() * 0.45, 2 + Math.random() * 3, color);
    }
  }

  const Effects = {
    particles: particles,
    marks: marks,

    spark: function (x, y, n) { burst(x, y, n || 7, '#ffe07a', 160); },
    blood: function (x, y, n) { burst(x, y, n || 9, '#c9343f', 120, 'blood'); },
    smoke: function (x, y, n, color) {
      n = n || 1;
      for (let i = 0; i < n; i++) {
        add('smoke', x + (Math.random() - 0.5) * 12, y + (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 22, -18 - Math.random() * 26,
          0.8 + Math.random() * 1.1, 7 + Math.random() * 11, color || 'rgba(60,58,58,0.55)');
      }
    },
    foam: function (x, y) {
      add('foam', x, y, (Math.random() - 0.5) * 8, -4 - Math.random() * 8,
        1.1 + Math.random(), 5 + Math.random() * 9, 'rgba(235,255,250,0.8)');
    },
    muzzle: function (x, y, a) {
      flashes.push({ x: x, y: y, a: a, life: 0.09 });
      burst(x + Math.cos(a) * 9, y + Math.sin(a) * 9, 3, '#fff3b0', 200);
    },
    explosion: function (x, y, big) {
      const n = big ? 36 : 24;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * U.TAU, s = (80 + Math.random() * 260) * (big ? 1.4 : 1);
        add(i % 3 === 0 ? 'smoke' : 'fire', x, y, Math.cos(a) * s, Math.sin(a) * s,
          0.45 + Math.random() * 0.9, 10 + Math.random() * 22,
          i % 3 === 0 ? 'rgba(45,42,42,0.62)' : (i % 2 ? '#ffb03a' : '#ff6b2c'));
      }
      flashes.push({ x: x, y: y, a: 0, life: 0.22, big: true });
      this.shake(big ? 22 : 14);
    },
    tire: function (x, y, a, strength) {
      if (marks.length > 700) marks.shift();
      marks.push({ x: x, y: y, a: a, life: 9 + Math.random() * 4, w: strength > 0.6 ? 4.5 : 2.5 });
    },
    shake: function (amount) { shake = Math.min(34, shake + amount); },
    shakeOffset: function () {
      if (shake < 0.1) return { x: 0, y: 0 };
      return { x: (Math.random() - 0.5) * shake, y: (Math.random() - 0.5) * shake };
    },

    update: function (dt) {
      shake *= Math.pow(0.02, dt);
      let i = particles.length;
      while (i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.type === 'smoke') { p.vx *= 0.97; p.vy *= 0.98; p.r += dt * 15; }
        else if (p.type === 'fire') { p.vx *= 0.94; p.vy *= 0.94; p.r += dt * 8; }
        else if (p.type === 'foam') { p.r += dt * 4; p.vx *= 0.96; }
        else { p.vy += 180 * dt; p.vx *= 0.95; }
      }
      i = marks.length;
      while (i--) { marks[i].life -= dt; if (marks[i].life <= 0) marks.splice(i, 1); }
      i = flashes.length;
      while (i--) { flashes[i].life -= dt; if (flashes[i].life <= 0) flashes.splice(i, 1); }
    },

    drawMarks: function (ctx) {
      ctx.save();
      for (let i = 0; i < marks.length; i++) {
        const m = marks[i];
        ctx.globalAlpha = Math.min(0.32, m.life * 0.035);
        ctx.strokeStyle = '#292522';
        ctx.lineWidth = m.w;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x - Math.cos(m.a) * 9, m.y - Math.sin(m.a) * 9);
        ctx.stroke();
      }
      ctx.restore();
    },

    drawParticles: function (ctx) {
      ctx.save();
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i], t = p.life / p.max;
        ctx.globalAlpha = p.type === 'smoke' ? t * 0.75 : t;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.r * (p.type === 'smoke' ? 1 : t)), 0, U.TAU);
        ctx.fill();
      }
      for (let i = 0; i < flashes.length; i++) {
        const f = flashes[i], alpha = Math.min(1, f.life / (f.big ? 0.22 : 0.09));
        ctx.globalAlpha = alpha;
        if (f.big) {
          const g = ctx.createRadialGradient(f.x, f.y, 4, f.x, f.y, 100);
          g.addColorStop(0, '#fffbe0'); g.addColorStop(0.35, '#ffae3c'); g.addColorStop(1, 'rgba(255,90,20,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(f.x, f.y, 100, 0, U.TAU); ctx.fill();
        } else {
          ctx.fillStyle = '#fff8c4';
          ctx.beginPath();
          ctx.moveTo(f.x, f.y);
          ctx.lineTo(f.x + Math.cos(f.a - 0.38) * 26, f.y + Math.sin(f.a - 0.38) * 26);
          ctx.lineTo(f.x + Math.cos(f.a + 0.38) * 26, f.y + Math.sin(f.a + 0.38) * 26);
          ctx.closePath(); ctx.fill();
        }
      }
      ctx.restore();
    },

    drawWorld: function (ctx) { this.drawMarks(ctx); this.drawParticles(ctx); },

    reset: function () {
      particles.length = 0; marks.length = 0; flashes.length = 0; shake = 0;
    }
  };

  SB.Effects = Effects;
})();
