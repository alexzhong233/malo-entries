// Particles, skid marks, muzzle flash, night tint, headlights and screen shake. All visual.
(function (SB) {
  'use strict';
  const u = SB.u, F = SB.FIELD, W = SB.WORLD;

  const FX = SB.effects = {};
  FX.create = function () {
    return { particles: [], skids: [], shake: 0, shakeX: 0, shakeY: 0, flash: 0 };
  };

  const COLORS = {
    spark: ['#fff2b0', '#ffc857', '#ff8a3c'],
    blood: ['#b42f36', '#8e2029', '#d94b43'],
    smoke: ['#5e6668', '#7e8584', '#454c50'],
    dust: ['#e6cba2', '#cdb088'],
    fire: ['#ffe27a', '#ff9d3c', '#e85535']
  };

  FX.burst = function (w, x, y, kind, count) {
    const fx = w.effects, r = w.rng;
    const colors = COLORS[kind] || COLORS.spark;
    for (let i = 0; i < count && fx.particles.length < 340; i += 1) {
      const a = r() * Math.PI * 2;
      const speed = kind === 'smoke' ? u.rand(r, 8, 34) : kind === 'fire' ? u.rand(r, 20, 70) : u.rand(r, 40, 150);
      const life = kind === 'smoke' ? u.rand(r, 1.1, 2.4) : u.rand(r, 0.25, 0.8);
      fx.particles.push({
        x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        life, max: life, r: kind === 'smoke' ? u.rand(r, 6, 15) : u.rand(r, 1.5, 4),
        color: colors[Math.floor(r() * colors.length)], kind
      });
    }
  };

  FX.explosion = function (w, x, y) {
    FX.burst(w, x, y, 'fire', 26);
    FX.burst(w, x, y, 'smoke', 22);
    FX.burst(w, x, y, 'spark', 14);
    FX.kick(w, 16);
    w.lastExplosion = w.time;
    SB.say(w, 'CAR BLOWN UP', 'That is going to make noise.', 2.4);
  };

  FX.kick = function (w, amount) {
    w.effects.shake = Math.min(24, w.effects.shake + amount);
  };

  FX.skid = function (w, x, y, angle) {
    const skids = w.effects.skids;
    if (skids.length > 420) skids.shift();
    skids.push({ x, y, angle, life: 13 });
  };

  FX.update = function (w, dt) {
    const fx = w.effects;
    for (let i = fx.particles.length - 1; i >= 0; i -= 1) {
      const p = fx.particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 1 - (p.kind === 'smoke' ? 1.1 : 2.2) * dt;
      p.vy *= 1 - (p.kind === 'smoke' ? 1.1 : 2.2) * dt;
      if (p.kind === 'smoke') p.r += 9 * dt;
      p.life -= dt;
      if (p.life <= 0) fx.particles.splice(i, 1);
    }
    for (let i = fx.skids.length - 1; i >= 0; i -= 1) {
      fx.skids[i].life -= dt;
      if (fx.skids[i].life <= 0) fx.skids.splice(i, 1);
    }
    fx.shake = Math.max(0, fx.shake - 26 * dt);
    fx.shakeX = (w.rng() - 0.5) * fx.shake;
    fx.shakeY = (w.rng() - 0.5) * fx.shake;
    fx.flash = Math.max(0, fx.flash - dt * 3);
  };

  FX.drawGround = function (ctx, w) {
    const skids = w.effects.skids;
    for (const s of skids) {
      ctx.save();
      ctx.translate(s.x, s.y); ctx.rotate(s.angle);
      ctx.fillStyle = 'rgba(42,31,22,' + (0.30 * Math.min(1, s.life / 4)).toFixed(2) + ')';
      ctx.fillRect(-9, -2.5, 18, 5);
      ctx.restore();
    }
  };

  FX.drawAir = function (ctx, w) {
    for (const p of w.effects.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  FX.drawMuzzle = function (ctx, w) {
    const p = w.player;
    if (p.muzzle <= 0) return;
    const mx = p.x + Math.cos(p.angle) * 25, my = p.y + Math.sin(p.angle) * 25;
    ctx.fillStyle = '#fff2b0';
    ctx.beginPath(); ctx.arc(mx, my, 7 * (p.muzzle / 0.08), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,190,90,0.45)';
    ctx.beginPath(); ctx.arc(mx, my, 13 * (p.muzzle / 0.08), 0, Math.PI * 2); ctx.fill();
  };

  function nightAmount(minutes) {
    const h = (minutes / 60 + 24) % 24;
    if (h >= 7 && h < 18) return 0;
    if (h >= 18 && h < 20) return (h - 18) / 2 * 0.46;
    if (h >= 20 || h < 5) return 0.46;
    if (h >= 5 && h < 7) return (7 - h) / 2 * 0.46;
    return 0;
  }

  FX.nightAmount = nightAmount;

  FX.drawNight = function (ctx, w) {
    const amount = nightAmount(w.clock);
    if (amount <= 0) return;
    const cam = w.camera, halfW = F.width / (2 * cam.zoom), halfH = F.height / (2 * cam.zoom);
    const x = u.clamp(cam.x - halfW, W.minX, W.maxX), y = u.clamp(cam.y - halfH, W.minY, W.maxY);
    ctx.fillStyle = 'rgba(16,32,64,' + amount.toFixed(3) + ')';
    ctx.fillRect(x, y, Math.min(halfW * 2, W.maxX - x), Math.min(halfH * 2, W.maxY - y));
    ctx.globalCompositeOperation = 'lighter';
    for (const car of w.cars) {
      ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(car.angle);
      const g = ctx.createLinearGradient(0, 0, 190, 0);
      g.addColorStop(0, 'rgba(255,240,180,0.30)'); g.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(14, -8); ctx.lineTo(190, -64); ctx.lineTo(190, 64); ctx.lineTo(14, 8); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
  };
})(window.SB = window.SB || {});
