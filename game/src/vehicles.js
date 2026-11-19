// Cars: hand-written top-down sprites and a simple velocity/along-heading model with drift,
// handbrake, collisions, damage and explosions.
(function (SB) {
  'use strict';
  const u = SB.u, C = SB.CAR, P = SB.PALETTE;

  const COLORS = ['#e3c25a', '#d9584f', '#4b9cc4', '#e8e4d5', '#3d7d6b', '#b06ba0', '#e69446', '#55647a'];
  const STYLES = {
    sedan: { w: 46, h: 24, speed: 1 }, sports: { w: 44, h: 21, speed: 1.18 },
    van: { w: 52, h: 26, speed: 0.84 }, taxi: { w: 46, h: 24, speed: 0.96 },
    delivery: { w: 50, h: 26, speed: 0.88 }, police: { w: 47, h: 24, speed: 1.10 }
  };

  SB.makeCar = function (w, x, y, angle, type, color, opts) {
    const o = opts || {};
    const style = STYLES[type] || STYLES.sedan;
    const health = o.health == null ? C.health : o.health;
    const car = {
      x, y, angle, vx: 0, vy: 0, throttle: 0, steer: 0, handbrake: false,
      type: type || 'sedan', color: color || u.pick(w.rng, COLORS),
      // maxHealth follows an explicit starting health, so staged cars show the right damage bar.
      health, maxHealth: health, radius: C.radius,
      ai: o.ai || null, isCop: !!o.cop, player: !!o.player, occupied: !!o.player,
      siren: !!o.cop, drift: false, smoke: 0, dead: false, flash: 0,
      w: style.w, h: style.h, speedFactor: style.speed
    };
    w.cars.push(car);
    if (car.isCop) w.cops.push(car);
    return car;
  };

  SB.removeCar = function (w, car) {
    car.dead = true;
    let i = w.cars.indexOf(car); if (i >= 0) w.cars.splice(i, 1);
    i = w.cops.indexOf(car); if (i >= 0) w.cops.splice(i, 1);
    if (w.player.inCar === car) { w.player.inCar = null; SB.downPlayer(w, 'wasted'); }
    if (w.mission.car === car) w.mission.car = null;
  };

  SB.damageCar = function (w, car, amount, x, y) {
    if (car.dead || amount <= 0) return;
    car.health -= amount;
    SB.effects.burst(w, x == null ? car.x : x, y == null ? car.y : y, 'spark', 4);
    if (car.health <= 0) SB.explodeCar(w, car);
  };

  SB.explodeCar = function (w, car) {
    if (car.dead) return;
    SB.effects.explosion(w, car.x, car.y);
    SB.audio.play(w.audioRef, 'explosion');
    if (u.dist(car.x, car.y, w.player.x, w.player.y) < 110) SB.hurtPlayer(w, 34, 'explosion');
    for (const ped of SB.pedsNear(w, car.x, car.y, 110)) SB.hurtPed(w, ped, 70, null);
    SB.removeCar(w, car);
  };

  SB.driveCar = function (w, car, throttle, steer, handbrake, dt) {
    const cos = Math.cos(car.angle), sin = Math.sin(car.angle);
    let forward = car.vx * cos + car.vy * sin;
    let lateral = -car.vx * sin + car.vy * cos;
    let engine = 0;
    if (throttle > 0) engine = C.accel * throttle * car.speedFactor;
    else if (throttle < 0) engine = forward > 12 ? C.brake * throttle : C.reverse * throttle;
    forward += engine * dt;
    const grip = handbrake ? C.driftGrip : C.grip;
    lateral *= Math.exp(-grip * dt);
    const drag = 1 - (throttle === 0 ? 1.35 : 0.42) * dt;
    forward *= drag;
    const max = C.maxSpeed * car.speedFactor;
    forward = u.clamp(forward, -max * 0.45, max);
    car.vx = cos * forward - sin * lateral;
    car.vy = sin * forward + cos * lateral;
    if (Math.abs(forward) > 5) {
      const turn = C.steer * Math.min(1, Math.abs(forward) / 80) * (handbrake ? 1.3 : 1);
      car.angle += steer * turn * dt * (forward < 0 ? -1 : 1);
    }
    car.drift = !!handbrake && Math.abs(forward) > 70;
    car.throttle = throttle; car.steer = steer; car.handbrake = !!handbrake;
    if (car.drift && Math.abs(lateral) > 22 && Math.floor(w.time * 24) % 2 === 0) {
      SB.effects.skid(w, car.x - cos * 16, car.y - sin * 16, car.angle);
    }
    car.x += car.vx * dt; car.y += car.vy * dt;
    if (w.city.isSand(car.x, car.y)) { car.vx *= 1 - 1.6 * dt; car.vy *= 1 - 1.6 * dt; }
  };

  SB.stepVehicles = function (w, dt) {
    // Snapshot the list: an exploding car removes itself mid-step, which would skip its neighbour.
    const cars = w.cars.slice();
    for (const car of cars) {
      if (car.dead) continue;
      const before = Math.hypot(car.vx, car.vy);
      const hit = w.city.resolveCircle(car.x, car.y, car.radius);
      if (hit.hit) {
        const dot = car.vx * hit.nx + car.vy * hit.ny;
        if (dot < 0) { car.vx -= 1.4 * dot * hit.nx; car.vy -= 1.4 * dot * hit.ny; }
        car.x = hit.x; car.y = hit.y;
        if (before > 42) {
          SB.damageCar(w, car, before * C.collisionDamage * 0.7, car.x, car.y);
          SB.effects.burst(w, car.x, car.y, 'spark', 5);
          if (car === w.player.inCar) SB.effects.kick(w, 4);
        }
        if (car.ai) { car.ai.wx = null; car.ai.flee = Math.max(car.ai.flee || 0, 1); }
      }
      if (car.health < 58) {
        car.smoke -= dt;
        if (car.smoke <= 0) {
          SB.effects.burst(w, car.x - Math.cos(car.angle) * 16, car.y - Math.sin(car.angle) * 16, 'smoke', 2);
          car.smoke = 0.12 + (car.health / 58) * 0.24;
        }
      }
      car.flash -= dt;
    }
    // Car vs car: shove apart, trade a little momentum and dent both.
    for (let i = 0; i < cars.length; i += 1) {
      const a = cars[i];
      if (a.dead) continue;
      for (let j = i + 1; j < cars.length; j += 1) {
        const b = cars[j];
        if (b.dead) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = a.radius + b.radius;
        if (d >= min || d < 0.001) continue;
        const nx = dx / d, ny = dy / d, push = (min - d) * 0.5 + 0.5;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (closing > 0) {
          a.vx -= closing * nx * 0.55; a.vy -= closing * ny * 0.55;
          b.vx += closing * nx * 0.55; b.vy += closing * ny * 0.55;
          if (closing > 55) {
            const dmg = closing * C.collisionDamage;
            SB.damageCar(w, a, dmg * (b.isCop ? 1.7 : 0.8), a.x + nx * 18, a.y + ny * 18);
            SB.damageCar(w, b, dmg * (a.isCop ? 1.7 : 0.8), b.x - nx * 18, b.y - ny * 18);
            if (a === w.player.inCar || b === w.player.inCar) {
              SB.effects.kick(w, 3);
              SB.audio.play(w.audioRef, 'punch');
            }
          }
        }
      }
    }
    // Car vs ped.
    for (const car of cars) {
      if (car.dead) continue;
      const speed = Math.hypot(car.vx, car.vy);
      if (speed < 26) continue;
      for (const ped of w.peds) {
        if (!ped.alive || u.dist(car.x, car.y, ped.x, ped.y) > 23) continue;
        SB.hurtPed(w, ped, speed * 0.9, car);
        if (car === w.player.inCar) SB.raiseWanted(w, 1, 'ran over a pedestrian');
      }
    }
  };

  SB.drawCar = function (ctx, car, w) {
    ctx.save();
    ctx.translate(car.x, car.y); ctx.rotate(car.angle);
    const hw = car.w / 2, hh = car.h / 2;
    ctx.fillStyle = P.shadow;
    ctx.fillRect(-hw + 3, -hh + 5, car.w, car.h);
    ctx.fillStyle = '#20272b';
    for (const wx of [-hw + 6, hw - 10]) {
      ctx.fillRect(wx, -hh - 3, 9, 5); ctx.fillRect(wx, hh - 2, 9, 5);
    }
    ctx.fillStyle = car.isCop ? '#e9e9e1' : car.color;
    if (car.type === 'taxi' && !car.isCop) ctx.fillStyle = '#f0c33e';
    ctx.fillRect(-hw, -hh, car.w, car.h);
    ctx.fillStyle = 'rgba(20,30,35,0.28)';
    ctx.fillRect(-hw, hh - 5, car.w, 5);
    if (car.isCop) {
      ctx.fillStyle = '#20262c';
      ctx.fillRect(-hw, -hh, car.w / 2, car.h);
      ctx.fillRect(0, -hh, 4, car.h);
    }
    if (car.type === 'taxi' && !car.isCop) {
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(-6, -hh, 12, 5);
    }
    ctx.fillStyle = 'rgba(36,66,74,0.88)';
    ctx.fillRect(-hw + 5, -hh + 3, 11, car.h - 6);
    ctx.fillRect(hw - 17, -hh + 3, 12, car.h - 6);
    ctx.fillStyle = 'rgba(255,248,220,0.35)';
    ctx.fillRect(hw - 17, -hh + 4, 3, car.h - 8);
    ctx.fillStyle = 'rgba(25,35,40,0.22)';
    ctx.fillRect(-5, -hh + 2, 11, car.h - 4);
    ctx.fillStyle = '#fff1b8';
    ctx.fillRect(hw - 2, -hh + 3, 4, 5); ctx.fillRect(hw - 2, hh - 8, 4, 5);
    ctx.fillStyle = '#b73e37';
    ctx.fillRect(-hw, -hh + 3, 3, 6); ctx.fillRect(-hw, hh - 9, 3, 6);
    if (!car.player) {
      ctx.fillStyle = '#6b4d3c';
      ctx.beginPath(); ctx.arc(-2, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d8a97f';
      ctx.beginPath(); ctx.arc(-2, 0, 3.6, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = '#d8a97f';
      ctx.beginPath(); ctx.arc(-2, 0, 4, 0, Math.PI * 2); ctx.fill();
    }
    if (car.isCop) {
      const blue = Math.floor(w.time * 5) % 2 === 0;
      ctx.fillStyle = blue ? '#3b7ef0' : '#e8443a';
      ctx.fillRect(-5, -hh - 3, 10, 5);
      ctx.globalAlpha = 0.18;
      ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (car.health < 80) {
      ctx.strokeStyle = 'rgba(40,30,25,0.45)'; ctx.lineWidth = 1.5;
      for (let k = 0; k < 3; k += 1) {
        const xx = -hw + 5 + k * 12;
        ctx.beginPath(); ctx.moveTo(xx, -hh + 5); ctx.lineTo(xx + 6, -hh + 11); ctx.stroke();
      }
    }
    ctx.restore();
  };
})(window.SB = window.SB || {});
