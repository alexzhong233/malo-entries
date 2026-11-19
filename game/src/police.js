(function (SB) {
  'use strict';

  var CFG = SB.CFG, U = SB.U, CITY = SB.City, P = CFG.POLICE;

  function setWanted(world, level, heat) {
    var old = world.wanted;
    world.wanted = U.clamp(Math.floor(level), 0, 5);
    if (world.wanted > old) {
      world.heat = world.wanted * 100;
      world.seenTimer = 0;
      world.lostTimer = 0;
      SB.Audio.ui();
    }
    if (heat !== undefined) world.heat = Math.max(world.heat, heat);
  }

  function reportCrime(world, label, level) {
    if (world.wanted >= 5) { world.lostTimer = 0; return; }
    setWanted(world, Math.max(world.wanted, level), level * 100);
    world.lastCrime = label;
    world.lostTimer = 0;
    SB.World.notify(world, label + '  •  ' + world.wanted + ' STAR' + (world.wanted === 1 ? '' : 'S'), '#ffd45e', 3.4);
  }

  function witnessCrime(world, level) {
    if (!world || world.witnessCooldown > 0) return;
    var p = world.player, i, d;
    var seen = false;
    for (i = 0; i < world.police.length && !seen; i++) {
      d = U.dist(world.police[i].x, world.police[i].y, p.x, p.y);
      if (d < 400 && CITY.clearLine(world.city, world.police[i].x, world.police[i].y, p.x, p.y)) seen = true;
    }
    for (i = 0; i < world.officers.length && !seen; i++) {
      d = U.dist(world.officers[i].x, world.officers[i].y, p.x, p.y);
      if (d < P.OFFICER_SIGHT) seen = true;
    }
    if (!seen) {
      for (i = 0; i < world.peds.length; i++) {
        if (U.dist2(world.peds[i].x, world.peds[i].y, p.x, p.y) < 210 * 210) { seen = true; break; }
      }
    }
    if (!seen) return;
    world.witnessCooldown = 6;
    reportCrime(world, 'SHOTS FIRED REPORTED', level || 1);
  }

  function spawnPoint(world, minD, maxD) {
    var p = world.player, city = world.city;
    var heading = p.car && Math.abs(p.car.speed) > 40 ? Math.atan2(p.car.vy, p.car.vx) : p.angle;
    for (var i = 0; i < 26; i++) {
      var a = heading + U.range(world.rng, -2.2, 2.2);
      var d = U.range(world.rng, minD, maxD);
      var raw = { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d };
      if (raw.x < 80 || raw.y < 80 || raw.x > CFG.WORLD_W - 80 || raw.y > CFG.WORLD_H - 80) continue;
      var road = CITY.nearestRoadPoint(city, raw.x, raw.y);
      if (CITY.blocked(city, road.x, road.y, 26)) continue;
      if (U.dist(road.x, road.y, p.x, p.y) < minD * 0.7) continue;
      return road;
    }
    return SB.World.clearSpot(world, p.x + 800, p.y + 400, 26);
  }

  function spawnCop(world, at) {
    var pos = at || spawnPoint(world, 640, 1100);
    var car = SB.Vehicles.create(pos.x, pos.y, world.rng() * U.TAU, {
      type: 'sedan', color: CFG.COLORS.police, isPolice: true, ai: true,
      maxSpeed: 250 + world.wanted * 14
    });
    car.radio = 'police scanner';
    car.patrolTarget = CITY.randomRoadPoint(world.city, world.rng);
    car.mode = world.wanted > 0 ? 'chase' : 'patrol';
    world.police.push(car);
    return car;
  }

  function spawnOfficer(world, x, y) {
    if (world.officers.length > 13) return;
    var spot = SB.World.clearSpot(world, x, y, 11);
    world.officers.push({
      x: spot.x, y: spot.y, angle: world.rng() * U.TAU,
      health: 55, alive: true, shootTimer: U.range(world.rng, 0.4, 1.5),
      hitFlash: 0, phase: world.rng() * 8, stride: 0
    });
  }

  function canSee(world, x, y) {
    var p = world.player;
    return CITY.clearLine(world.city, x, y, p.x, p.y);
  }

  function updateWanted(world, dt) {
    if (world.witnessCooldown > 0) world.witnessCooldown -= dt;
    if (world.wanted <= 0) return;
    var p = world.player, seen = false, i;
    for (i = 0; i < world.police.length; i++) {
      var c = world.police[i];
      if (c.wrecked) continue;
      if (U.dist2(c.x, c.y, p.x, p.y) < P.SIGHT * P.SIGHT && canSee(world, c.x, c.y)) { seen = true; break; }
    }
    if (!seen) for (i = 0; i < world.officers.length; i++) {
      if (world.officers[i].alive && U.dist2(world.officers[i].x, world.officers[i].y, p.x, p.y) < 500 * 500) { seen = true; break; }
    }
    if (seen) {
      world.seenTimer = Math.min(20, world.seenTimer + dt);
      world.lostTimer = 0;
      world.heat = Math.min(100, world.heat + dt * 12);
    } else {
      world.lostTimer += dt;
      world.seenTimer = Math.max(0, world.seenTimer - dt * 0.8);
      world.heat = Math.max(0, world.heat - dt * 5);
      if (world.lostTimer >= P.LOSE_TIME) {
        world.wanted--;
        world.lostTimer = 0;
        world.heat = world.wanted * 62;
        world.seenTimer = 0;
        SB.World.notify(world, 'YOU LOST THE COPS  •  ' + world.wanted + ' STAR' + (world.wanted === 1 ? '' : 'S'), '#9cf0c0', 3);
        SB.Audio.ui();
        if (world.wanted === 0) world.officers.length = 0;
      }
    }
  }

  function updateCars(world, dt) {
    var p = world.player, i;
    var desired = world.wanted > 0 ? Math.min(P.MAX_CARS, world.wanted + 1) : 2;
    var active = 0;
    for (i = 0; i < world.police.length; i++) if (!world.police[i].wrecked) active++;
    while (active < desired) { spawnCop(world); active++; }

    for (i = world.police.length - 1; i >= 0; i--) {
      var car = world.police[i];
      if (car.stolen) continue;
      var d = U.dist(car.x, car.y, p.x, p.y);
      if (car.wrecked) {
        SB.Vehicles.integrate(world, car, 0, 0, true, false, dt);
        if (d > P.DESPAWN) world.police.splice(i, 1);
        continue;
      }
      if (d > P.DESPAWN && world.wanted === 0) { world.police.splice(i, 1); continue; }
      car.mode = world.wanted > 0 ? 'chase' : 'patrol';
      if (car.mode === 'patrol') {
        if (U.dist(car.x, car.y, car.patrolTarget.x, car.patrolTarget.y) < 70) {
          car.patrolTarget = CITY.randomRoadPoint(world.city, world.rng);
        }
        SB.Vehicles.driveAI(world, car, car.patrolTarget.x, car.patrolTarget.y, dt, { speed: 130 });
      } else {
        var tx = p.x, ty = p.y;
        if (p.car) {
          // Lead the target for an interception, and try to PIT from behind.
          tx += p.car.vx * 0.5; ty += p.car.vy * 0.5;
          if (d < 150 && Math.abs(U.angleDelta(car.angle, p.car.angle)) < 0.8) {
            car.maxSpeed = 265 + world.wanted * 20;
          } else car.maxSpeed = 235 + world.wanted * 14;
          if (d < 48 && Math.abs(car.speed) > 70) {
            SB.Vehicles.damage(world, p.car, dt * (16 + world.wanted * 4));
            SB.FX.spark((car.x + p.x) / 2, (car.y + p.y) / 2, '#ffda79', 4);
            SB.FX.shake(world, 1.6);
          }
        }
        SB.Vehicles.driveAI(world, car, tx, ty, dt, { speed: car.maxSpeed });
        if (world.wanted >= 3 && d < 300 && U.dist2(car.x, car.y, p.x, p.y) > 62 * 62 &&
            !p.car && world.officers.length < world.wanted * 2 && Math.random() < dt * 0.45) {
          spawnOfficer(world, car.x + Math.cos(car.angle + 1.57) * 32, car.y + Math.sin(car.angle + 1.57) * 32);
        }
        if (world.wanted >= 2 && !p.car && d < 95) {
          // Slow cruiser provides cover while officers deploy.
          SB.Vehicles.driveAI(world, car, tx, ty, dt, { speed: 55, stopAt: 90 });
        }
      }
    }
  }

  function updateOfficers(world, dt) {
    var p = world.player;
    for (var i = world.officers.length - 1; i >= 0; i--) {
      var o = world.officers[i];
      if (!o.alive) { world.officers.splice(i, 1); continue; }
      o.hitFlash = Math.max(0, o.hitFlash - dt);
      o.shootTimer -= dt;
      var d = U.dist(o.x, o.y, p.x, p.y);
      var see = d < P.OFFICER_SIGHT && CITY.clearLine(world.city, o.x, o.y, p.x, p.y);
      if (see) {
        o.angle = U.angleLerp(o.angle, Math.atan2(p.y - o.y, p.x - o.x), Math.min(1, dt * 8));
        if (d > 185) {
          var vx = Math.cos(o.angle) * 92, vy = Math.sin(o.angle) * 92;
          SB.World.move(world, o, vx * dt, vy * dt, 10);
          o.stride += dt * 10;
        } else if (d < 110) {
          SB.World.move(world, o, -Math.cos(o.angle) * 70 * dt, -Math.sin(o.angle) * 70 * dt, 10);
        }
        if (d < P.OFFICER_RANGE && o.shootTimer <= 0 && world.wanted > 0) {
          o.shootTimer = U.range(world.rng, 0.55, 1.25) / (1 + world.wanted * 0.08);
          var a = o.angle + U.range(world.rng, -0.09 - world.wanted * 0.008, 0.09 + world.wanted * 0.008);
          var ox = o.x + Math.cos(a) * 15, oy = o.y + Math.sin(a) * 15;
          world.bullets.push({ x: ox, y: oy, px: ox, py: oy,
            vx: Math.cos(a) * 780, vy: Math.sin(a) * 780,
            life: 0, max: 0.85, owner: 'police', damage: 7 + world.wanted });
          SB.FX.muzzle(ox, oy, a);
          SB.Audio.shot();
        }
      } else {
        o.phase += dt;
        o.angle += Math.sin(o.phase) * dt * 0.5;
      }
      if (d > 1700) world.officers.splice(i, 1);
    }
  }

  function updateRoadblocks(world, dt) {
    if (world.wanted < 4) return;
    world.roadblockTimer -= dt;
    if (world.roadblockTimer > 0) return;
    world.roadblockTimer = U.range(world.rng, 16, 24);
    var p = world.player;
    var ahead = { x: p.x + Math.cos(p.angle) * 560, y: p.y + Math.sin(p.angle) * 560 };
    var base = CITY.nearestRoadPoint(world.city, ahead.x, ahead.y);
    for (var i = -1; i <= 1; i += 2) {
      var spot = SB.World.clearSpot(world, base.x + i * 46, base.y, 24);
      var car = spawnCop(world, spot);
      car.mode = 'chase';
      car.speed = 0; car.vx = 0; car.vy = 0;
      car.angle = Math.atan2(p.y - car.y, p.x - car.x);
    }
    SB.World.notify(world, 'ROADBLOCK AHEAD', '#ff6b5e', 2.5);
  }

  function update(world, dt) {
    updateWanted(world, dt);
    updateCars(world, dt);
    updateOfficers(world, dt);
    updateRoadblocks(world, dt);
  }

  function drawOfficers(ctx, world) {
    for (var i = 0; i < world.officers.length; i++) {
      var o = world.officers[i];
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.fillStyle = 'rgba(30,25,25,0.3)';
      ctx.beginPath(); ctx.ellipse(3, 6, 11, 6, 0, 0, U.TAU); ctx.fill();
      ctx.rotate(o.angle);
      ctx.fillStyle = '#1b2d55';
      U.roundRect(ctx, -6, -5, 12, 10, 3); ctx.fill();
      ctx.fillStyle = '#e9b48a';
      ctx.beginPath(); ctx.arc(1, 0, 4.8, 0, U.TAU); ctx.fill();
      ctx.fillStyle = '#14203c';
      ctx.fillRect(-3, -5, 8, 2.5);
      ctx.fillStyle = '#ffd45e';
      ctx.fillRect(-3, 2, 3, 2);
      ctx.strokeStyle = '#e9b48a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(3, -2); ctx.lineTo(12, -2); ctx.stroke();
      ctx.fillStyle = '#2b2f36'; ctx.fillRect(10, -3.5, 11, 3);
      ctx.restore();
    }
  }

  SB.Police = {
    setWanted: setWanted, reportCrime: reportCrime, witnessCrime: witnessCrime,
    spawnCop: spawnCop, spawnOfficer: spawnOfficer, update: update, drawOfficers: drawOfficers
  };
})(window.SB = window.SB || {});
