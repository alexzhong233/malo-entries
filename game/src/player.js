// The player: on-foot WASD movement, mouse aim, fists and pistol, and hold-E hotwiring of the
// nearest car. Once inside a car the same input drives it through vehicles.js.
(function (SB) {
  'use strict';
  const u = SB.u, P = SB.PLAYER;

  SB.updatePlayer = function (w, input, dt) {
    const p = w.player;
    p.fire = Math.max(0, p.fire - dt);
    p.punch = Math.max(0, p.punch - dt);
    p.muzzle = Math.max(0, p.muzzle - dt);
    p.fist = Math.max(0, p.fist - dt);
    p.hurt = Math.max(0, p.hurt - dt);

    // Aim follows the pointer in world space even while driving.
    const aim = input.aim(w.camera);
    p.aimX = aim.x; p.aimY = aim.y;
    if (p.inCar) {
      const car = p.inCar;
      p.angle = Math.atan2(aim.y - car.y, aim.x - car.x);
      // Positive steer rotates the heading clockwise on screen, so D is the right-turn key.
      SB.driveCar(w, car, input.axis('KeyS', 'KeyW'), input.axis('KeyA', 'KeyD'), input.isDown('Space'), dt);
      p.x = car.x; p.y = car.y;
      if (input.consume('KeyE')) SB.exitCar(w);
      if (input.mouse.down && p.fire <= 0 && p.gun && p.ammo > 0) SB.shoot(w, 0.10);
      return;
    }

    let ax = input.axis('KeyA', 'KeyD'), ay = input.axis('KeyW', 'KeyS');
    if (ax === 0) ax = input.axis('ArrowLeft', 'ArrowRight');
    if (ay === 0) ay = input.axis('ArrowUp', 'ArrowDown');
    const mag = Math.hypot(ax, ay);
    p.sprinting = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    p.moving = mag > 0;
    if (mag > 0) {
      const speed = p.sprinting ? P.sprint : P.speed;
      const sand = w.city.isSand(p.x, p.y) ? 0.62 : 1;
      const hit = w.city.resolveCircle(p.x + ax / mag * speed * sand * dt, p.y + ay / mag * speed * sand * dt, P.radius);
      p.x = hit.x; p.y = hit.y;
      p.walk += speed * dt * 0.075;
    }
    p.angle = Math.atan2(aim.y - p.y, aim.x - p.x);

    if (input.consume('KeyG')) {
      p.gun = !p.gun;
      SB.say(w, p.gun ? 'Pistol ready' : 'Fists up', p.gun ? p.ammo + ' rounds' : 'Click to punch', 1.6);
    }
    if (input.consume('KeyE')) {
      const car = SB.nearestCar(w, p.x, p.y, 62, function (c) { return !c.dead && !c.player; });
      if (car) {
        p.hotwireTarget = car;
        p.hotwire = 0;
        SB.say(w, hotwireLabel(car), 'Hold E to hotwire', 1.8);
      }
    }
    if (p.hotwireTarget) {
      const car = p.hotwireTarget;
      const holding = input.isDown('KeyE') && u.dist(p.x, p.y, car.x, car.y) < 74 && !car.dead;
      if (!holding) { p.hotwire = 0; p.hotwireTarget = null; }
      else {
        p.hotwire += dt / (car.isCop ? P.hotwireTime * 1.5 : P.hotwireTime);
        if (p.hotwire >= 1) SB.stealCar(w, car);
      }
    }
    if (input.mouse.right || input.consume('KeyF')) {
      if (p.punch <= 0) SB.punch(w);
    } else if (input.mouse.down && p.fire <= 0) {
      if (p.gun && p.ammo > 0) SB.shoot(w, 0.035);
      else if (p.punch <= 0) SB.punch(w);
    }
  };

  function hotwireLabel(car) {
    return car.isCop ? 'POLICE CAR — HOTWIRE' : 'Hotwiring ' + car.type.toUpperCase();
  }

  SB.shoot = function (w, spread) {
    const p = w.player;
    if (p.ammo <= 0) return; // keep the smoke tests and rapid clicks honest
    p.fire = P.fireRate;
    p.muzzle = 0.08;
    p.ammo -= 1;
    w.lastGunshot = w.time;
    const x = p.x + Math.cos(p.angle) * 17, y = p.y + Math.sin(p.angle) * 17;
    SB.addBullet(w, x, y, p.angle, 'player', 24, spread || 0.04);
    w.effects.flash = 1;
    SB.effects.kick(w, 1.4);
    SB.audio.play(w.audioRef, 'gun');
    if (p.ammo <= 0) SB.say(w, 'Out of ammo', 'Fists still work — look for ammo pickups', 2.2);
  };

  SB.punch = function (w) {
    const p = w.player;
    p.punch = P.punchRate;
    p.fist = 0.2;
    SB.audio.play(w.audioRef, 'punch');
    let hit = false;
    for (const ped of w.peds) {
      if (!ped.alive || u.dist(p.x, p.y, ped.x, ped.y) > P.punchRange) continue;
      const a = Math.atan2(ped.y - p.y, ped.x - p.x);
      if (Math.abs(u.angleDiff(a, p.angle)) > 1.1) continue;
      SB.hurtPed(w, ped, P.punchDamage, null);
      SB.effects.kick(w, 2);
      hit = true;
      break;
    }
    if (!hit) {
      const car = SB.nearestCar(w, p.x + Math.cos(p.angle) * 20, p.y + Math.sin(p.angle) * 20, 28);
      if (car) SB.damageCar(w, car, 5, car.x, car.y);
    }
  };

  SB.stealCar = function (w, car) {
    const p = w.player;
    const wasOccupied = !!car.ai;
    p.hotwire = 0; p.hotwireTarget = null;
    p.inCar = car;
    car.player = true; car.occupied = true; car.ai = null;
    p.x = car.x; p.y = car.y;
    w.stats.cars += 1;
    const level = car.isCop ? 3 : wasOccupied ? 2 : 1;
    SB.raiseWanted(w, level, car.isCop ? 'police car stolen' : 'vehicle stolen');
    SB.say(w, car.isCop ? 'COP CAR!' : 'CAR STEALER', 'Lose the heat, then lay low.', 2.8);
    SB.audio.play(w.audioRef, 'pickup');
  };

  SB.exitCar = function (w) {
    const p = w.player, car = p.inCar;
    if (!car) return;
    // Take the door with more clearance so a wall on one side cannot shove the player across the car.
    const exitAngle = car.angle + Math.PI / 2;
    const left = w.city.resolveCircle(car.x + Math.cos(exitAngle) * 36, car.y + Math.sin(exitAngle) * 36, P.radius);
    const right = w.city.resolveCircle(car.x - Math.cos(exitAngle) * 36, car.y - Math.sin(exitAngle) * 36, P.radius);
    const spot = u.dist(left.x, left.y, car.x, car.y) <= u.dist(right.x, right.y, car.x, car.y) ? left : right;
    p.x = spot.x; p.y = spot.y;
    car.player = false; car.occupied = false;
    p.inCar = null;
    p.hotwire = 0; p.hotwireTarget = null;
    SB.say(w, 'On foot', '', 1.2);
  };
})(window.SB = window.SB || {});
