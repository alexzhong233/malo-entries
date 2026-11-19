(function (SB) {
  'use strict';

  var CFG = SB.CFG, U = SB.U;

  function create(x, y, angle, opts) {
    opts = opts || {};
    var type = opts.type || 'sedan';
    var color = opts.color || U.pick(Math.random, CFG.CAR_COLORS);
    return {
      x: x, y: y, angle: angle || 0, vx: 0, vy: 0, speed: 0,
      type: type, color: color,
      length: type === 'truck' ? 60 : (type === 'sport' ? 48 : 54),
      width: type === 'truck' ? 27 : 25,
      maxSpeed: opts.maxSpeed || (type === 'sport' ? CFG.CAR.MAX_SPEED * 1.18 :
        (type === 'truck' ? CFG.CAR.MAX_SPEED * 0.72 : CFG.CAR.MAX_SPEED)),
      health: CFG.CAR.MAX_HEALTH, wrecked: false, damageFlash: 0,
      steerVisual: 0, braking: false, sirenPhase: 0,
      isPolice: !!opts.isPolice, ai: !!opts.ai,
      radio: opts.radio || '', forgot: 0, smokeTimer: 0
    };
  }

  function damage(world, car, amount) {
    if (car.wrecked) return;
    car.health -= amount;
    car.damageFlash = 0.18;
    if (car.health <= 0) {
      car.health = 0;
      car.wrecked = true;
      car.speed = 0; car.vx = 0; car.vy = 0;
      SB.FX.explosion(world, car.x, car.y);
      SB.Audio.explosion();
      if (world.player.car === car) {
        SB.World.notify(world, 'Your ride is toast!', '#ff7a6a', 3);
      }
    }
  }

  function collide(world, car, dt) {
    var r = CFG.CAR.RADIUS;
    var nx = car.x + car.vx * dt, ny = car.y + car.vy * dt;
    var bx = SB.City.blocked(world.city, nx, car.y, r);
    var by = SB.City.blocked(world.city, car.x, ny, r);
    SB.World.move(world, car, car.vx * dt, car.vy * dt, r);
    if (bx) car.vx *= -0.24;
    if (by) car.vy *= -0.24;
    if (bx || by) {
      var force = Math.hypot(car.vx, car.vy);
      if (force > 65) {
        damage(world, car, force * dt * 0.16);
        SB.FX.spark(car.x + U.sign(car.vx) * 18, car.y + U.sign(car.vy) * 12, '#ffcf72', 5);
        SB.FX.shake(world, Math.min(4, force / 90));
        SB.Audio.hit();
      }
      car.vx *= 0.55; car.vy *= 0.55;
    }
  }

  // Shared physics for player, traffic and police: throttle, steering, lateral grip.
  function integrate(world, car, throttle, steer, brake, handbrake, dt) {
    if (car.wrecked) {
      car.vx *= Math.exp(-5 * dt); car.vy *= Math.exp(-5 * dt);
      car.speed = Math.hypot(car.vx, car.vy);
      car.smokeTimer -= dt;
      if (car.smokeTimer <= 0) { SB.FX.smoke(car.x, car.y - 8, 1, true); car.smokeTimer = 0.12; }
      return;
    }
    var cos = Math.cos(car.angle), sin = Math.sin(car.angle);
    var forward = car.vx * cos + car.vy * sin;
    var lateral = -car.vx * sin + car.vy * cos;
    var boost = SB.Input.shift() && !car.ai ? CFG.CAR.BOOST : 1;

    if (throttle > 0) forward += throttle * CFG.CAR.ACCEL * boost * dt;
    else if (throttle < 0) {
      if (forward > 12) forward -= CFG.CAR.BRAKE * dt;
      else forward -= CFG.CAR.REVERSE * dt;
    }
    if (brake) forward = U.approach(forward, 0, CFG.CAR.BRAKE * dt);
    if (!throttle && !brake) forward = U.approach(forward, 0, CFG.CAR.ROLL * dt);
    forward *= Math.exp(-CFG.CAR.DRAG * Math.abs(forward) / 400 * dt);
    forward = U.clamp(forward, -CFG.CAR.REVERSE * 1.3, car.maxSpeed * boost);

    var speedRatio = U.clamp(Math.abs(forward) / 125, 0, 1);
    var turn = CFG.CAR.TURN * speedRatio * (forward < 0 ? -1 : 1);
    car.angle += steer * turn * dt;
    car.steerVisual = U.damp(car.steerVisual, steer, 9, dt);

    var grip = handbrake ? CFG.CAR.DRIFT_GRIP : CFG.CAR.SIDE_GRIP;
    lateral *= Math.exp(-grip * dt);
    cos = Math.cos(car.angle); sin = Math.sin(car.angle);
    car.vx = cos * forward - sin * lateral;
    car.vy = sin * forward + cos * lateral;
    car.speed = forward;
    car.braking = !!brake;

    if (handbrake && Math.abs(lateral) > 26 && Math.abs(forward) > 70) {
      SB.FX.tire(car.x - cos * 15, car.y - sin * 15, car.angle);
      SB.FX.tire(car.x + cos * 15, car.y + sin * 15, car.angle);
      if (Math.random() < dt * 6) SB.Audio.skid();
    }
    collide(world, car, dt);
    if (car.damageFlash > 0) car.damageFlash -= dt;
    if (car.health < 45 && Math.random() < dt * 4) SB.FX.smoke(car.x - cos * 18, car.y - sin * 18, 1, true);
  }

  function updatePlayerCar(world, car, dt) {
    var I = SB.Input;
    var throttle = I.down('KeyW') || I.down('ArrowUp') ? 1 : 0;
    if (I.down('KeyS') || I.down('ArrowDown')) throttle = -1;
    var steer = (I.down('KeyD') || I.down('ArrowRight') ? 1 : 0) -
                (I.down('KeyA') || I.down('ArrowLeft') ? 1 : 0);
    var brake = I.down('KeyB');
    var handbrake = I.down('Space');
    integrate(world, car, throttle, steer, brake, handbrake, dt);
    if (car.wrecked) return;
    car.sirenPhase += dt;
  }

  // Police and traffic steering helper; aims at a world point with speed control.
  function driveAI(world, car, tx, ty, dt, opts) {
    opts = opts || {};
    var dist = U.dist(car.x, car.y, tx, ty);
    var desired = Math.atan2(ty - car.y, tx - car.x);
    if (opts.flee && dist < 260) desired += Math.PI;
    var diff = U.angleDelta(car.angle, desired);
    var steer = U.clamp(diff * 2.1, -1, 1);
    var targetSpeed = opts.speed || 185;
    if (Math.abs(diff) > 1.15) targetSpeed *= 0.45;
    if (opts.flee) targetSpeed = car.maxSpeed * 0.94;
    var throttle = car.speed < targetSpeed ? 1 : 0;
    var brake = car.speed > targetSpeed + 34;
    if (dist < (opts.stopAt || 0)) { throttle = 0; brake = true; }
    integrate(world, car, throttle, steer, brake, false, dt);
    if (car.sirenPhase !== undefined) car.sirenPhase += dt;
  }

  function drawHeadlights(ctx, car, night) {
    if (night <= 0.02) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = night * 0.24;
    ctx.fillStyle = '#fff1bd';
    var L = car.length * 0.5;
    var W = car.width * 0.5;
    ctx.beginPath();
    ctx.moveTo(L - 4, -W + 3); ctx.lineTo(L + 150, -W - 42);
    ctx.lineTo(L + 150, W + 42); ctx.lineTo(L - 4, W - 3);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function draw(ctx, world, car) {
    var L = car.length * 0.5, W = car.width * 0.5;
    var night = 1 - SB.World.sunLevel(world);
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);

    // Shadow first, offset as though the sun is high in the west.
    ctx.fillStyle = 'rgba(40,32,28,0.28)';
    U.roundRect(ctx, -L + 7, -W + 9, L * 2, W * 2, 8); ctx.fill();
    drawHeadlights(ctx, car, night);

    // Wheels.
    ctx.fillStyle = '#25272b';
    var wheelW = 10, wheelH = 6;
    [-1, 1].forEach(function (side) {
      var fy = side * (W - 3);
      ctx.save();
      ctx.translate(L * 0.58, fy);
      ctx.rotate(car.steerVisual * 0.32);
      ctx.fillRect(-wheelW * 0.5, -wheelH * 0.5, wheelW, wheelH);
      ctx.restore();
      ctx.fillRect(-L * 0.72 - wheelW * 0.5, fy - wheelH * 0.5, wheelW, wheelH);
    });

    var body = car.wrecked ? '#5a4f48' : car.color;
    ctx.fillStyle = body;
    U.roundRect(ctx, -L, -W, L * 2, W * 2, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.5; ctx.stroke();

    // Roof and glass.
    ctx.fillStyle = car.wrecked ? '#3a3735' : '#2c3c4b';
    U.roundRect(ctx, -L * 0.52, -W + 3, L * 1.05, W * 2 - 6, 4); ctx.fill();
    ctx.fillStyle = car.wrecked ? '#4b4540' : U.shade(car.color, -0.12);
    U.roundRect(ctx, -L * 0.44, -W + 5, L * 0.86, W * 2 - 10, 3); ctx.fill();
    ctx.fillStyle = 'rgba(150,205,220,0.42)';
    ctx.fillRect(L * 0.02, -W + 5, L * 0.32, W * 2 - 10);

    if (car.isPolice) {
      ctx.fillStyle = '#244ba0';
      ctx.fillRect(-L * 0.85, -W + 2, L * 0.5, 3);
      ctx.fillRect(-L * 0.85, W - 5, L * 0.5, 3);
      ctx.fillStyle = '#f4f7ff';
      ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
      ctx.fillText('POLICE', 0, 3);
      var phase = Math.floor(car.sirenPhase * 5) % 2;
      ctx.fillStyle = phase ? '#ff3b37' : 'rgba(255,60,55,0.25)';
      ctx.fillRect(-3, -W - 1, 6, 4);
      ctx.fillStyle = phase ? 'rgba(60,120,255,0.25)' : '#3f7dff';
      ctx.fillRect(-3, W - 3, 6, 4);
      if (night > 0.3) {
        ctx.globalAlpha = 0.3 * night;
        ctx.fillStyle = phase ? '#ff3232' : '#3a7bff';
        ctx.beginPath(); ctx.arc(0, 0, 52, -Math.PI / 3, Math.PI / 3); ctx.fill();
        ctx.restore(); ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(car.angle);
      }
    } else if (car.type === 'taxi') {
      ctx.fillStyle = '#222';
      for (var tx = -L * 0.8; tx < L * 0.8; tx += 8) ctx.fillRect(tx, -W + 2, 4, 3);
      ctx.fillStyle = '#f7d94b';
      U.roundRect(ctx, -5, -W - 3, 10, 5, 2); ctx.fill();
    }

    // Lights and battle damage.
    ctx.fillStyle = car.braking ? '#ff5d4d' : '#ffb9a0';
    ctx.fillRect(-L - 1, -W + 3, 3, 5);
    ctx.fillRect(-L - 1, W - 8, 3, 5);
    ctx.fillStyle = night > 0.35 ? '#fff4cc' : '#efe3bd';
    ctx.fillRect(L - 2, -W + 3, 3, 5);
    ctx.fillRect(L - 2, W - 8, 3, 5);
    if (car.health < 65) {
      ctx.strokeStyle = 'rgba(30,25,22,0.55)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-L * 0.85, -W + 5); ctx.lineTo(-L * 0.3, W - 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(L * 0.35, -W + 4); ctx.lineTo(L * 0.6, W - 3); ctx.stroke();
    }
    if (car.damageFlash > 0) {
      ctx.fillStyle = 'rgba(255,235,180,' + (car.damageFlash * 2).toFixed(2) + ')';
      U.roundRect(ctx, -L, -W, L * 2, W * 2, 7); ctx.fill();
    }
    ctx.restore();
  }

  SB.Vehicles = {
    create: create, damage: damage, integrate: integrate,
    updatePlayerCar: updatePlayerCar, driveAI: driveAI, draw: draw
  };
})(window.SB = window.SB || {});
