// Wanted system: 1–5 stars, cop cars that spawn just out of sight and pursue, officers who shoot
// at three stars or more, line-of-sight decay, and BUSTED / WASTED handling.
(function (SB) {
  'use strict';
  const u = SB.u, L = SB.POLICE;

  SB.raiseWanted = function (w, amount, reason) {
    const before = w.wanted;
    w.wanted = u.clamp(before === 0 ? amount : before + amount, 1, 5);
    w.unseen = 0;
    w.copTimer = Math.min(w.copTimer, w.wanted >= 4 ? 1.4 : 2.5);
    if (w.wanted >= 4) w.roadblockTimer = Math.min(w.roadblockTimer == null ? 99 : w.roadblockTimer, 2);
    const stars = '★'.repeat(w.wanted) + '☆'.repeat(5 - w.wanted);
    SB.say(w, 'WANTED ' + stars, reason || 'Officers are on the way', 3.2);
    SB.audio.play(w.audioRef, w.wanted >= 4 ? 'siren' : 'busted');
  };

  // Four and five stars add cruisers parked across the road ahead of a fleeing player.
  // city.node() already returns world-space grid coordinates (i * GRID), not indices.
  function dropRoadblock(w) {
    const p = w.player;
    const x = p.inCar ? p.inCar.x : p.x, y = p.inCar ? p.inCar.y : p.y;
    const a = p.inCar ? p.inCar.angle : p.angle;
    const node = w.city.node(x + Math.cos(a) * 480, y + Math.sin(a) * 480);
    const across = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a));
    for (let k = -1; k <= 1; k += 2) {
      const rx = node.x + (across ? 19 : k * 44);
      const ry = node.y + (across ? k * 44 : 19);
      if (w.city.buildingAt(rx, ry) || u.dist(rx, ry, x, y) < 220) continue;
      const car = SB.makeCar(w, rx, ry, across ? Math.PI / 2 : 0, 'police', '#e8e8df', {
        cop: true, ai: { fire: 1, ram: 0, block: true }
      });
      car.health = car.maxHealth;
    }
  }

  function roadSpawn(w) {
    const p = w.player, n = w.city.node(p.x, p.y);
    for (let i = 0; i < 24; i += 1) {
      const ni = u.clamp(n.i + Math.floor(u.rand(w.rng, -3, 4)), 0, SB.NODES - 1);
      const nj = u.clamp(n.j + Math.floor(u.rand(w.rng, -3, 4)), 0, SB.NODES - 1);
      const x = ni * SB.GRID + 19, y = nj * SB.GRID + 19;
      const d = u.dist(x, y, p.x, p.y);
      if (d > 360 && d < 820 && !w.city.buildingAt(x, y)) return { x, y };
    }
    return { x: u.clamp(p.x + 520, 80, 1450), y: u.clamp(p.y + 520, 80, 1450) };
  }

  SB.spawnCopCar = function (w) {
    const s = roadSpawn(w);
    const a = Math.atan2(w.player.y - s.y, w.player.x - s.x);
    return SB.makeCar(w, s.x, s.y, a, 'police', '#e8e8df', {
      cop: true, ai: { fire: u.rand(w.rng, 0.5, 1.6), ram: 0 }
    });
  };

  SB.spawnFootCop = function (w) {
    const s = roadSpawn(w);
    const ped = SB.spawnPed(w, s.x, s.y, { cop: true });
    ped.speed = 134; // keeps up with traffic, but never with a sprinting player
    return ped;
  };

  SB.updatePolice = function (w, dt) {
    const p = w.player;
    const px = p.inCar ? p.inCar.x : p.x, py = p.inCar ? p.inCar.y : p.y;
    const wanted = w.wanted;

    // Spawning: 2 → 4 → 6 → 8 → 8 cruisers, then back-up officers and roadblocks.
    w.copTimer -= dt;
    const carLimit = [0, 2, 4, 6, 8, 8][u.clamp(wanted, 0, 5)];
    if (wanted > 0 && w.copTimer <= 0 && w.cops.length < carLimit) {
      SB.spawnCopCar(w);
      w.copTimer = Math.max(2.5, L.spawnEvery - wanted * 1.9);
    }
    w.roadblockTimer = (w.roadblockTimer == null ? 14 : w.roadblockTimer) - dt;
    if (wanted >= 4 && w.roadblockTimer <= 0 && w.cops.length < carLimit + 2) {
      dropRoadblock(w);
      w.roadblockTimer = 16 - wanted;
    }
    w.footTimer = (w.footTimer || 0) - dt;
    if (wanted >= 3) {
      const officers = w.peds.filter(function (ped) { return ped.cop && ped.alive; }).length;
      if (officers < wanted - 1 && w.footTimer <= 0 && w.copTimer > 2) {
        SB.spawnFootCop(w);
        w.footTimer = Math.max(5, 10 - wanted);
      }
    }

    // Cop cars pursue and ram. Iterate a copy: a wrecked cruiser is removed from w.cops mid-step.
    for (const car of w.cops.slice()) {
      if (car.dead) continue;
      const ai = car.ai || (car.ai = { fire: 1, ram: 0 });
      const dx = px - car.x, dy = py - car.y;
      const d = Math.hypot(dx, dy);
      const target = Math.atan2(dy, dx);
      const diff = u.angleDiff(target, car.angle);
      const steer = u.clamp(diff * 2.6, -1, 1);
      const throttle = Math.abs(diff) > 1.6 ? 0.35 : d > 90 ? 1 : 0.7;
      if (!ai.block) SB.driveCar(w, car, throttle, steer, Math.abs(diff) > 2.2 && d < 160, dt);
      ai.fire -= dt;
      if (wanted >= 3 && ai.fire <= 0 && d < L.officerRange && d > 35) {
        ai.fire = Math.max(1.15, L.officerShot + w.rng() * 0.7 - wanted * 0.12);
        const sx = car.x + Math.cos(car.angle) * 18, sy = car.y + Math.sin(car.angle) * 18;
        SB.addBullet(w, sx, sy, Math.atan2(py - sy, px - sx) + u.rand(w.rng, -0.07, 0.07), 'cop', L.carDamage, 0.09);
        w.effects.flash = Math.max(w.effects.flash, 0.6);
        SB.audio.play(w.audioRef, 'gun');
      }
    }

    // Officers on foot chase and, at three stars, shoot.
    for (const ped of w.peds) {
      if (!ped.cop || !ped.alive) continue;
      const d = u.dist(ped.x, ped.y, px, py);
      if (d > 1000) { ped.x = u.clamp(p.x + u.rand(w.rng, -420, 420), 40, 1480); ped.y = u.clamp(p.y + u.rand(w.rng, -420, 420), 40, 1480); }
      const a = Math.atan2(py - ped.y, px - ped.x);
      ped.angle = u.turnToward(ped.angle, a, 8 * dt);
      if (d > 26) {
        const spot = w.city.resolveCircle(ped.x + Math.cos(a) * ped.speed * dt, ped.y + Math.sin(a) * ped.speed * dt, 8);
        ped.x = spot.x; ped.y = spot.y;
      }
      ped.walk += dt * 14;
      ped.fire -= dt;
      if (wanted >= 3 && ped.fire <= 0 && d < L.officerRange) {
        ped.fire = Math.max(1.2, L.officerShot + w.rng() * 0.9 - wanted * 0.12);
        SB.addBullet(w, ped.x, ped.y, a + u.rand(w.rng, -0.06, 0.06), 'cop', L.footDamage, 0.1);
        SB.audio.play(w.audioRef, 'gun');
      }
      if (!p.inCar && d < 30 && wanted > 0) {
        w.arrest += dt;
        if (w.arrest > Math.max(1.1, L.arrestTime - (wanted - 1) * 0.2)) SB.downPlayer(w, 'busted');
      }
    }
    if (!w.peds.some(function (ped) { return ped.cop && ped.alive && u.dist(ped.x, ped.y, px, py) < 60; })) w.arrest = 0;

    // Evasion: out of sight long enough loses one star.
    let sighted = false;
    for (const car of w.cops) if (u.dist(car.x, car.y, px, py) < L.sight) { sighted = true; break; }
    if (!sighted) for (const ped of w.peds) {
      if (ped.cop && ped.alive && u.dist(ped.x, ped.y, px, py) < L.sight * 0.7) { sighted = true; break; }
    }
    if (wanted > 0) {
      w.unseen = sighted ? 0 : w.unseen + dt;
      if (w.unseen > L.decayTime) {
        w.wanted -= 1; w.unseen = 0;
        SB.say(w, 'Lost them. ' + (w.wanted ? 'Keep moving.' : 'You are clean.'), 'Wanted level dropped', 2.6);
        if (w.wanted === 0) w.copTimer = 12;
      }
    }
    if (w.wanted === 0) {
      w.roadblockTimer = 14;
      for (const car of w.cops.slice()) if (u.dist(car.x, car.y, px, py) > 900) SB.removeCar(w, car);
      for (const ped of w.peds) if (ped.cop && !ped.alive && ped.corpse <= 0) ped.corpse = 4;
    }
  };
})(window.SB = window.SB || {});
