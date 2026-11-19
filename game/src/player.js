(function (SB) {
  'use strict';

  var CFG = SB.CFG, U = SB.U, CITY = SB.City;

  function create(x, y) {
    return {
      x: x, y: y, vx: 0, vy: 0, angle: -Math.PI / 2,
      health: CFG.PLAYER.MAX_HEALTH, alive: true, car: null,
      shootCooldown: 0, shootFlash: 0, hurtFlash: 0, invuln: 0,
      walkPhase: 0, moving: false, lastCar: null
    };
  }

  function spawnParked(world, count) {
    for (var i = 0; i < count; i++) {
      var rp = CITY.randomRoadPoint(world.city, world.rng);
      var off = CFG.ROAD_W * 0.5 + 9;
      var dir = world.rng() > 0.5 ? 1 : -1;
      var x = rp.x + (rp.vertical ? off * dir : 0);
      var y = rp.y + (rp.vertical ? 0 : off * dir);
      if (CITY.blocked(world.city, x, y, 25)) continue;
      var angle = rp.vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
      var car = SB.Vehicles.create(x, y, angle, { ai: false });
      car.parked = true;
      car.color = U.pick(world.rng, CFG.CAR_COLORS);
      world.traffic.push(car);
    }
  }

  function nearestCar(world, p) {
    var best = null, bd = 74 * 74;
    var lists = [world.traffic, world.police];
    for (var l = 0; l < lists.length; l++) {
      var arr = lists[l];
      for (var i = 0; i < arr.length; i++) {
        var c = arr[i];
        if (c.wrecked || c.stolen) continue;
        var d = U.dist2(p.x, p.y, c.x, c.y);
        if (d < bd && (arr !== world.police || p.health > 0)) { bd = d; best = c; }
      }
    }
    return best;
  }

  function enterCar(world, p, car) {
    if (!car || car.wrecked || p.car) return;
    var ti = world.traffic.indexOf(car), pi = world.police.indexOf(car);
    if (ti >= 0) world.traffic.splice(ti, 1);
    if (pi >= 0) world.police.splice(pi, 1);
    car.stolen = true; car.parked = false; car.ai = false;
    car.vx = 0; car.vy = 0; car.speed = 0;
    p.car = car; p.lastCar = car;
    p.x = car.x; p.y = car.y;
    world.stats.stolen++;
    SB.Audio.ui();
    SB.World.notify(world, car.isPolice ? 'You stole a police cruiser. Bold.' : 'Carjacked! ' + car.radio.toUpperCase() + ' press W to drive.', '#ffd45e', 2.6);
  }

  function exitCar(world, p) {
    var car = p.car;
    if (!car) return;
    var side = car.angle + Math.PI / 2;
    var spot = SB.World.clearSpot(world, car.x + Math.cos(side) * 34, car.y + Math.sin(side) * 34, 14);
    p.x = spot.x; p.y = spot.y;
    p.vx = 0; p.vy = 0;
    p.car = null;
    car.stolen = false; car.parked = true; car.ai = false;
    car.speed = 0; car.vx = 0; car.vy = 0;
    if (car.isPolice) world.police.push(car);
    else world.traffic.push(car);
    SB.Audio.ui();
  }

  function shoot(world, p) {
    if (p.shootCooldown > 0) return;
    p.shootCooldown = CFG.PLAYER.SHOOT_DELAY;
    p.shootFlash = 0.075;
    var angle = p.angle + U.range(Math.random, -0.035, 0.035);
    var ox = p.x + Math.cos(angle) * 17, oy = p.y + Math.sin(angle) * 17;
    if (p.car) {
      ox = p.car.x + Math.cos(p.car.angle) * 6 + Math.cos(angle) * 25;
      oy = p.car.y + Math.sin(p.car.angle) * 6 + Math.sin(angle) * 25;
    }
    var speed = CFG.PLAYER.BULLET_SPEED;
    world.bullets.push({
      x: ox, y: oy, px: ox, py: oy,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 0, max: CFG.PLAYER.BULLET_LIFE, owner: 'player', damage: p.car ? 9 : 15
    });
    world.stats.shots++;
    SB.FX.muzzle(ox, oy, angle);
    SB.FX.shake(world, 1.2);
    SB.Audio.shot();
    SB.Police.witnessCrime(world, 1);
  }

  function damage(world, p, amount) {
    if (!p.alive || p.invuln > 0) return;
    p.health -= amount;
    p.hurtFlash = 0.55;
    p.invuln = 0.22;
    SB.FX.blood(p.x, p.y);
    SB.FX.shake(world, 3);
    SB.Audio.hit();
    if (p.health <= 0) {
      p.health = 0;
      p.alive = false;
      if (p.car) exitCar(world, p);
      world.state = 'gameover';
      world.wanted = 0;
      SB.Audio.fail();
      SB.Save.write(world);
    }
  }

  function update(world, dt) {
    var p = world.player, I = SB.Input;
    p.shootCooldown = Math.max(0, p.shootCooldown - dt);
    p.shootFlash = Math.max(0, p.shootFlash - dt);
    p.hurtFlash = Math.max(0, p.hurtFlash - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    if (!p.alive) return;

    if (p.car) {
      if (p.car.wrecked) { exitCar(world, p); }
      else {
        SB.Vehicles.updatePlayerCar(world, p.car, dt);
        p.x = p.car.x; p.y = p.car.y;
        if (I.just('KeyE')) { exitCar(world, p); I.consume('KeyE'); }
      }
    } else {
      p.angle = Math.atan2(I.worldY - p.y, I.worldX - p.x);
      var mx = (I.down('KeyD') || I.down('ArrowRight') ? 1 : 0) -
               (I.down('KeyA') || I.down('ArrowLeft') ? 1 : 0);
      var my = (I.down('KeyS') || I.down('ArrowDown') ? 1 : 0) -
               (I.down('KeyW') || I.down('ArrowUp') ? 1 : 0);
      var l = Math.hypot(mx, my);
      if (l > 0) {
        mx /= l; my /= l;
        p.vx += mx * CFG.PLAYER.ACCEL * dt;
        p.vy += my * CFG.PLAYER.ACCEL * dt;
        p.moving = true;
      } else p.moving = false;
      var damp = Math.exp(-(p.moving ? 2.1 : CFG.PLAYER.FRICTION) * dt);
      p.vx *= damp; p.vy *= damp;
      var sp = Math.hypot(p.vx, p.vy);
      if (sp > CFG.PLAYER.SPEED) { p.vx *= CFG.PLAYER.SPEED / sp; p.vy *= CFG.PLAYER.SPEED / sp; }
      var beforeX = p.x, beforeY = p.y;
      SB.World.move(world, p, p.vx * dt, p.vy * dt, CFG.PLAYER.RADIUS);
      if (Math.abs(p.x - beforeX) < Math.abs(p.vx * dt) * 0.4) p.vx *= 0.4;
      if (Math.abs(p.y - beforeY) < Math.abs(p.vy * dt) * 0.4) p.vy *= 0.4;
      world.stats.distance += U.dist(beforeX, beforeY, p.x, p.y);
      if (p.moving) p.walkPhase += dt * 13;
      if (I.just('KeyE')) {
        var car = nearestCar(world, p);
        if (car) { enterCar(world, p, car); I.consume('KeyE'); }
      }
    }
    if (I.mouse.down) shoot(world, p);
  }

  function hitSegment(target, b) {
    return U.distToSegment(target.x, target.y, b.px, b.py, b.x, b.y) < target.r + 4;
  }

  function updateBullets(world, dt) {
    for (var i = world.bullets.length - 1; i >= 0; i--) {
      var b = world.bullets[i];
      b.px = b.x; b.py = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life += dt;
      var remove = b.life > b.max || CITY.blocked(world.city, b.x, b.y, 1) ||
        !CITY.clearLine(world.city, b.px, b.py, b.x, b.y);
      if (remove) { SB.FX.spark(b.x, b.y, '#ffdc94', 3); world.bullets.splice(i, 1); continue; }
      var j, hit = false;
      if (b.owner === 'player') {
        for (j = world.police.length - 1; j >= 0; j--) {
          var cop = world.police[j];
          if (hitSegment({ x: cop.x, y: cop.y, r: 18 }, b)) {
            SB.Vehicles.damage(world, cop, b.damage * 1.4);
            SB.FX.spark(b.x, b.y, '#bfe0ff', 5);
            hit = true; break;
          }
        }
        if (!hit) for (j = world.officers.length - 1; j >= 0; j--) {
          var o = world.officers[j];
          if (!o.alive) continue;
          if (hitSegment({ x: o.x, y: o.y, r: 10 }, b)) {
            o.health -= b.damage; o.hitFlash = 0.2; SB.FX.blood(o.x, o.y);
            if (o.health <= 0) { o.alive = false; SB.FX.floatText(o.x, o.y, 'OFFICER DOWN', '#ffd45e'); }
            hit = true; break;
          }
        }
        if (!hit) for (j = world.targets.length - 1; j >= 0; j--) {
          var t = world.targets[j];
          if (!t.alive || !hitSegment(t, b)) continue;
          t.hp -= b.damage;
          t.hitFlash = 0.15;
          SB.FX.spark(b.x, b.y, '#ffda78', 6);
          if (t.hp <= 0) {
            t.alive = false;
            SB.FX.explosion(world, t.x, t.y);
            SB.FX.floatText(t.x, t.y, 'TARGET DOWN', '#8ff0c2');
            if (world.mission) world.mission.hits++;
            SB.Audio.explosion();
          }
          hit = true; break;
        }
      } else if (b.owner === 'police') {
        var p = world.player;
        if (!p.car && hitSegment({ x: p.x, y: p.y, r: 10 }, b)) {
          damage(world, p, b.damage); hit = true;
        } else if (p.car && hitSegment({ x: p.car.x, y: p.car.y, r: 23 }, b)) {
          SB.Vehicles.damage(world, p.car, b.damage * 0.45);
          SB.FX.spark(b.x, b.y, '#ffcf72', 4); hit = true;
        }
      }
      if (hit) world.bullets.splice(i, 1);
    }
  }

  function draw(ctx, world, p) {
    if (p.car || !p.alive) return;
    var bob = p.moving ? Math.sin(p.walkPhase) * 1.8 : 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(40,32,28,0.3)';
    ctx.beginPath(); ctx.ellipse(4, 7, 13, 8, 0, 0, U.TAU); ctx.fill();
    ctx.rotate(p.angle);
    ctx.fillStyle = p.hurtFlash > 0 ? '#ff7b70' : '#3c4a63';
    ctx.fillRect(-5, -6 + bob, 6, 4);
    ctx.fillRect(-5, 2 - bob, 6, 4);
    ctx.fillStyle = p.hurtFlash > 0 ? '#ffb0a5' : '#e8a95d';
    U.roundRect(ctx, -6, -5, 12, 10, 4); ctx.fill();
    ctx.fillStyle = '#d9a878';
    ctx.beginPath(); ctx.arc(1, 0, 5.2, 0, U.TAU); ctx.fill();
    ctx.fillStyle = '#3a2c28';
    ctx.beginPath(); ctx.arc(1.6, 0, 4.3, -1.1, 1.1); ctx.fill();
    // Arm and pistol point at the mouse.
    ctx.strokeStyle = '#d9a878'; ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.moveTo(3, -1); ctx.lineTo(13, -2); ctx.stroke();
    ctx.fillStyle = '#292d33';
    ctx.fillRect(11, -3.5, 12, 4);
    if (p.shootFlash > 0) {
      ctx.fillStyle = '#fff0b0';
      ctx.beginPath(); ctx.moveTo(23, -1.5); ctx.lineTo(40, -8); ctx.lineTo(34, -1);
      ctx.lineTo(40, 6); ctx.lineTo(23, 1.5); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  SB.Player = {
    create: create, update: update, draw: draw, shoot: shoot, damage: damage,
    updateBullets: updateBullets, enterCar: enterCar, exitCar: exitCar,
    spawnParked: spawnParked, nearestCar: nearestCar
  };
})(window.SB = window.SB || {});
