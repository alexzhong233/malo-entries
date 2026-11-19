/* SOLARA BAY - vehicle physics, collisions, damage and car rendering. */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const C = SB.C, U = SB.U;

  const PAINTS = ['#f1d06a', '#e35b52', '#4fa8d8', '#f3f0e4', '#393f4b', '#7bc48b', '#c07ad1', '#ef8e3c'];

  function Vehicle(x, y, a, opts) {
    opts = opts || {};
    this.x = x; this.y = y; this.a = a || 0;
    this.vx = 0; this.vy = 0;
    this.w = 38; this.h = 20;
    this.kind = opts.kind || 'civilian';
    this.color = opts.color || U.pick(Math.random, PAINTS);
    this.maxSpeed = opts.maxSpeed || (this.kind === 'police' ? 365 : 285);
    this.accel = opts.accel || (this.kind === 'police' ? 300 : C.CAR_ACCEL);
    this.brake = C.CAR_BRAKE;
    this.grip = C.CAR_GRIP;
    this.drag = C.CAR_DRAG;
    this.hp = 170; this.maxHp = 170;
    this.wrecked = false; this.boomed = false;
    this.smokeTimer = 0; this.flash = 0;
    this.controls = { throttle: 0, brake: 0, steer: 0 };
    this.ai = null; this.occupied = false;
    this.id = Vehicle.nextId++;
    this.sirenPhase = Math.random() * 2;
  }
  Vehicle.nextId = 1;

  Vehicle.prototype.speed = function () { return Math.hypot(this.vx, this.vy); };

  Vehicle.prototype.damage = function (amount) {
    if (this.wrecked || amount <= 0) return;
    this.hp -= amount;
    this.flash = 0.09;
    if (this.hp < 85 && Math.random() < 0.35) SB.Effects.smoke(this.x, this.y, 1);
    if (this.hp <= 0) {
      this.hp = 0;
      this.wrecked = true;
      this.maxSpeed = 0; this.accel = 0;
      if (!this.boomed) {
        this.boomed = true;
        SB.Effects.explosion(this.x, this.y, this.kind === 'police');
        SB.Audio.boom();
        SB.Effects.tire(this.x, this.y, this.a, 1);
      }
    }
  };

  Vehicle.prototype.update = function (dt) {
    this.flash = Math.max(0, this.flash - dt);
    this.sirenPhase += dt * 7;
    const ca = Math.cos(this.a), sa = Math.sin(this.a);
    let fwd = this.vx * ca + this.vy * sa;
    let lat = -this.vx * sa + this.vy * ca;
    const ctl = this.controls;
    if (this.wrecked) {
      fwd *= Math.pow(0.015, dt);
    } else {
      const brakePower = fwd > 6 ? this.brake : this.accel * 0.62;
      fwd += (ctl.throttle * this.accel - ctl.brake * brakePower) * dt;
      fwd -= fwd * this.drag * dt;
      fwd = U.clamp(fwd, -this.maxSpeed * 0.36, this.maxSpeed);
      const grip = this.grip * (Math.abs(ctl.steer) > 0.75 && Math.abs(fwd) > 170 ? 0.42 : 1);
      lat *= Math.exp(-grip * dt);
      const authority = U.clamp(Math.abs(fwd) / 85, 0, 1);
      this.a += ctl.steer * 2.45 * authority * (fwd >= 0 ? 1 : -1) * dt;
      if (Math.abs(fwd) > 150 && Math.abs(ctl.steer) > 0.55 && Math.random() < dt * 22) {
        SB.Effects.tire(this.x - ca * 16, this.y - sa * 16, this.a, Math.abs(ctl.steer));
      }
    }
    const nca = Math.cos(this.a), nsa = Math.sin(this.a);
    this.vx = nca * fwd - nsa * lat;
    this.vy = nsa * fwd + nca * lat;
    const hit = SB.World.move(this, this.vx * dt, this.vy * dt, C.CAR_R);
    if (hit.x || hit.y) {
      const impact = Math.hypot(this.vx, this.vy);
      if (impact > 55) {
        this.damage(impact * 0.14);
        SB.Effects.spark(this.x, this.y, 5);
      }
      if (hit.x) this.vx *= -0.22;
      if (hit.y) this.vy *= -0.22;
    }
    if (this.hp < 85 && !this.wrecked) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) { this.smokeTimer = 0.18; SB.Effects.smoke(this.x, this.y, 1); }
    }
  };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  Vehicle.prototype.draw = function (ctx, night) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.a);
    if (night && !this.wrecked) {
      const g = ctx.createLinearGradient(14, 0, 165, 0);
      g.addColorStop(0, 'rgba(255,240,180,0.34)');
      g.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(14, -5); ctx.lineTo(165, -58); ctx.lineTo(165, 58); ctx.lineTo(14, 5); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = 'rgba(40,26,20,0.3)';
    roundRect(ctx, -16, -7, 40, 22, 6); ctx.fill();
    ctx.fillStyle = this.flash > 0 ? '#fff1d2' : this.color;
    roundRect(ctx, -20, -11, 40, 21, 6); ctx.fill();
    ctx.fillStyle = U.shade(this.color, -38);
    roundRect(ctx, -9, -9, 18, 17, 4); ctx.fill();
    ctx.fillStyle = 'rgba(40,70,90,0.85)';
    roundRect(ctx, -7, -8, 8, 16, 2); ctx.fill();
    roundRect(ctx, 3, -8, 5, 16, 2); ctx.fill();
    ctx.fillStyle = '#202126';
    ctx.fillRect(-13, -13, 9, 4); ctx.fillRect(5, -13, 9, 4);
    ctx.fillRect(-13, 9, 9, 4); ctx.fillRect(5, 9, 9, 4);
    ctx.fillStyle = '#fff4bd';
    ctx.fillRect(18, -8, 3, 5); ctx.fillRect(18, 3, 3, 5);
    ctx.fillStyle = '#c93636';
    ctx.fillRect(-21, -8, 3, 5); ctx.fillRect(-21, 3, 3, 5);
    if (this.kind === 'police') {
      ctx.fillStyle = '#e9edf2';
      roundRect(ctx, -20, -11, 40, 21, 6); ctx.fill();
      ctx.fillStyle = '#25364c';
      ctx.fillRect(-20, -2, 40, 4);
      ctx.fillStyle = '#1b4f9c';
      ctx.fillRect(-18, -10, 10, 5); ctx.fillRect(8, 5, 10, 5);
      const on = Math.sin(this.sirenPhase) > 0;
      ctx.fillStyle = on ? '#3fa8ff' : '#1b3f80';
      ctx.fillRect(-5, -6, 9, 4);
      ctx.fillStyle = on ? '#a82b32' : '#5b2024';
      ctx.fillRect(-5, 2, 9, 4);
      if (Math.sin(this.sirenPhase) > 0.86) {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#4aa4ff'; ctx.beginPath(); ctx.arc(0, 0, 42, 0, U.TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    if (this.wrecked) {
      ctx.strokeStyle = 'rgba(35,30,28,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-16, -8); ctx.lineTo(4, 5); ctx.moveTo(-6, 9); ctx.lineTo(12, -6); ctx.stroke();
    }
    ctx.restore();
  };

  const Vehicles = {
    list: [],

    reset: function () { this.list.length = 0; Vehicle.nextId = 1; },

    spawn: function (x, y, a, opts) {
      const v = new Vehicle(x, y, a, opts);
      this.list.push(v);
      return v;
    },

    nearest: function (x, y, maxDist, predicate) {
      let best = null, bd = maxDist * maxDist;
      for (let i = 0; i < this.list.length; i++) {
        const v = this.list[i];
        if (v.wrecked || (predicate && !predicate(v))) continue;
        const d = U.dist2(x, y, v.x, v.y);
        if (d < bd) { bd = d; best = v; }
      }
      return best;
    },

    update: function (dt) {
      const list = this.list;
      for (let i = 0; i < list.length; i++) list[i].update(dt);
      // Light-weight bumper contacts; also stops cars stacking in jams.
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j];
          if (Math.abs(a.x - b.x) > 42 || Math.abs(a.y - b.y) > 42) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 1;
          const overlap = 36 - d;
          if (overlap <= 0) continue;
          const nx = dx / d, ny = dy / d;
          const push = overlap * 0.25;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
          const closing = Math.abs((a.vx - b.vx) * nx + (a.vy - b.vy) * ny);
          if (closing > 70) {
            a.damage(closing * 0.05); b.damage(closing * 0.05);
            SB.Effects.spark((a.x + b.x) / 2, (a.y + b.y) / 2, 3);
          }
          a.vx *= 0.94; a.vy *= 0.94; b.vx *= 0.94; b.vy *= 0.94;
        }
      }
    },

    draw: function (ctx, night) {
      for (let i = 0; i < this.list.length; i++) this.list[i].draw(ctx, night);
    }
  };

  SB.Vehicle = Vehicle;
  SB.Vehicles = Vehicles;
})();
