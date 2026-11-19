(function (SB) {
  'use strict';

  var U = SB.U;
  var MAX_PARTICLES = 720;
  var particles = [];
  var marks = [];
  var rings = [];
  var texts = [];
  var flash = 0;

  function push(p) { if (particles.length < MAX_PARTICLES) particles.push(p); }

  function spark(x, y, color, count) {
    count = count || 8;
    for (var i = 0; i < count; i++) {
      var a = Math.random() * U.TAU, s = 45 + Math.random() * 190;
      push({ kind: 'spark', x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: U.range(Math.random, 0.18, 0.5), max: 0.5, r: U.range(Math.random, 1.2, 2.8),
        color: color || '#ffd266', drag: 3 });
    }
  }

  function smoke(x, y, count, dark) {
    count = count || 4;
    for (var i = 0; i < count; i++) {
      push({ kind: 'smoke', x: x + U.range(Math.random, -7, 7), y: y + U.range(Math.random, -7, 7),
        vx: U.range(Math.random, -18, 18) - 12, vy: U.range(Math.random, -34, -8),
        life: U.range(Math.random, 0.8, 1.9), max: 1.9, r: U.range(Math.random, 6, 13),
        color: dark ? 'rgba(46,44,44,0.55)' : 'rgba(220,220,212,0.45)', drag: 1.1 });
    }
  }

  function blood(x, y) {
    for (var i = 0; i < 12; i++) {
      var a = Math.random() * U.TAU, s = 30 + Math.random() * 120;
      push({ kind: 'blood', x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: U.range(Math.random, 0.35, 0.9), max: 0.9, r: U.range(Math.random, 1.5, 3.5),
        color: '#b1292e', drag: 2.5 });
    }
  }

  function muzzle(x, y, angle) {
    for (var i = 0; i < 6; i++) {
      var a = angle + U.range(Math.random, -0.34, 0.34), s = U.range(Math.random, 90, 250);
      push({ kind: 'spark', x: x + Math.cos(angle) * 12, y: y + Math.sin(angle) * 12,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: U.range(Math.random, 0.06, 0.16),
        max: 0.16, r: U.range(Math.random, 2, 4), color: i % 2 ? '#fff4bd' : '#ffae34', drag: 5 });
    }
  }

  function explosion(world, x, y) {
    world.camera.shake = Math.min(28, world.camera.shake + 18);
    flash = Math.min(1, flash + 0.75);
    rings.push({ x: x, y: y, r: 8, life: 0, max: 0.7, color: '#ffcf78' });
    rings.push({ x: x, y: y, r: 3, life: 0, max: 1.0, color: '#ff7a36' });
    for (var i = 0; i < 56; i++) {
      var a = Math.random() * U.TAU, s = U.range(Math.random, 60, 420);
      push({ kind: i % 3 === 0 ? 'smoke' : 'spark',
        x: x + U.range(Math.random, -8, 8), y: y + U.range(Math.random, -8, 8),
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: U.range(Math.random, 0.35, 1.5), max: 1.5,
        r: U.range(Math.random, 3, 12), color: i % 4 === 0 ? 'rgba(50,45,42,0.65)' :
          (i % 3 ? '#ffb43c' : '#fff0bb'), drag: 2.1 });
    }
  }

  function tire(x, y, angle) {
    if (marks.length > 750) marks.shift();
    marks.push({ x: x, y: y, angle: angle, life: 0, max: 13 });
  }

  function floatText(x, y, str, color) {
    texts.push({ x: x, y: y, str: str, color: color || '#fff6d8', life: 0, max: 1.15 });
  }

  function shake(world, amount) { world.camera.shake = Math.min(30, world.camera.shake + amount); }

  function update(world, dt) {
    var i, p;
    for (i = particles.length - 1; i >= 0; i--) {
      p = particles[i];
      p.life += dt;
      if (p.life >= p.max) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      var f = Math.exp(-p.drag * dt);
      p.vx *= f; p.vy *= f;
      if (p.kind === 'smoke') { p.vy -= 12 * dt; p.r += dt * 13; }
      if (p.kind === 'spark') p.vy += 70 * dt;
      if (p.kind === 'blood') p.vy += 40 * dt;
    }
    for (i = rings.length - 1; i >= 0; i--) {
      rings[i].life += dt;
      rings[i].r += dt * 240;
      if (rings[i].life >= rings[i].max) rings.splice(i, 1);
    }
    for (i = texts.length - 1; i >= 0; i--) {
      texts[i].life += dt; texts[i].y -= dt * 34;
      if (texts[i].life >= texts[i].max) texts.splice(i, 1);
    }
    for (i = marks.length - 1; i >= 0; i--) {
      marks[i].life += dt;
      if (marks[i].life >= marks[i].max) marks.splice(i, 1);
    }
    flash = Math.max(0, flash - dt * 2.6);
  }

  function drawMarks(ctx, world) {
    var view = world.view || { left: 0, top: 0, right: 6000, bottom: 6000 };
    ctx.save();
    for (var i = 0; i < marks.length; i++) {
      var m = marks[i];
      if (m.x < view.left - 60 || m.x > view.right + 60 || m.y < view.top - 60 || m.y > view.bottom + 60) continue;
      ctx.globalAlpha = 0.26 * (1 - m.life / m.max);
      ctx.strokeStyle = '#22242a';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(m.x - Math.cos(m.angle) * 9, m.y - Math.sin(m.angle) * 9);
      ctx.lineTo(m.x + Math.cos(m.angle) * 9, m.y + Math.sin(m.angle) * 9);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawWorld(ctx, world) {
    var view = world.view || { left: 0, top: 0, right: 6000, bottom: 6000 };
    ctx.save();
    for (var i = 0; i < rings.length; i++) {
      var g = rings[i];
      ctx.globalAlpha = 0.7 * (1 - g.life / g.max);
      ctx.strokeStyle = g.color; ctx.lineWidth = 5 * (1 - g.life / g.max) + 1;
      ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, U.TAU); ctx.stroke();
    }
    for (i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (p.x < view.left - 80 || p.x > view.right + 80 || p.y < view.top - 80 || p.y > view.bottom + 80) continue;
      var t = 1 - p.life / p.max;
      ctx.globalAlpha = p.kind === 'smoke' ? t * 0.8 : Math.min(1, t * 2);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.kind === 'smoke' ? p.r * (1.3 - t * 0.3) : p.r * t, 0, U.TAU);
      ctx.fill();
    }
    for (i = 0; i < texts.length; i++) {
      var tx = texts[i];
      ctx.globalAlpha = Math.min(1, (1 - tx.life / tx.max) * 2);
      ctx.fillStyle = tx.color;
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(tx.str, tx.x, tx.y);
    }
    ctx.restore();
  }

  function drawScreen(ctx) {
    if (flash > 0.01) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,232,178,' + (flash * 0.32).toFixed(3) + ')';
      ctx.fillRect(0, 0, 4000, 2400);
      ctx.restore();
    }
  }

  function reset() { particles.length = 0; marks.length = 0; rings.length = 0; texts.length = 0; flash = 0; }

  SB.FX = {
    spark: spark, smoke: smoke, blood: blood, muzzle: muzzle, explosion: explosion,
    tire: tire, floatText: floatText, shake: shake, update: update,
    drawMarks: drawMarks, drawWorld: drawWorld, drawScreen: drawScreen, reset: reset
  };
})(window.SB = window.SB || {});
