// Traffic and pedestrians: lane-following AI, wandering walkers, gunfire panic, and the small
// drawn people that populate the sidewalks.
(function (SB) {
  'use strict';
  const u = SB.u, G = SB.GRID, T = SB.TRAFFIC, P = SB.PALETTE;

  const DIRS = [{ i: 1, j: 0, a: 0 }, { i: 0, j: 1, a: Math.PI / 2 }, { i: -1, j: 0, a: Math.PI }, { i: 0, j: -1, a: -Math.PI / 2 }];
  const SHIRTS = ['#d76b58', '#4e86a8', '#e0b455', '#6e9e67', '#a673a2', '#e8e0c9', '#3e6b78'];
  const SKINS = ['#d9a97f', '#b97b55', '#8d5c3e', '#e8c39c', '#6f4732'];

  function laneOffset(dir, node) {
    const x = node.i * G, y = node.j * G;
    if (dir === 0) return { x, y: y + 19 };
    if (dir === 2) return { x, y: y - 19 };
    if (dir === 1) return { x: x - 19, y };
    return { x: x + 19, y };
  }

  SB.spawnTrafficCar = function (w, x, y, dir, type) {
    const ai = { dir, node: null, wx: 0, wy: 0, flee: 0, yield: 0 };
    const car = SB.makeCar(w, x, y, DIRS[dir].a, type || u.pick(w.rng, ['sedan', 'sedan', 'taxi', 'van', 'sports']), null, { ai });
    const here = w.city.node(x, y);
    ai.node = { i: u.clamp(here.i + DIRS[dir].i, 0, SB.NODES - 1), j: u.clamp(here.j + DIRS[dir].j, 0, SB.NODES - 1) };
    const wp = laneOffset(dir, ai.node); ai.wx = wp.x; ai.wy = wp.y;
    return car;
  };

  SB.spawnPed = function (w, x, y, opts) {
    const o = opts || {};
    const point = o.x == null ? w.city.randomSidewalkPoint(w.rng) : { x, y };
    const ped = {
      x: point.x, y: point.y, angle: w.rng() * Math.PI * 2,
      tx: point.x, ty: point.y,
      color: o.cop ? '#386fa4' : u.pick(w.rng, SHIRTS),
      skin: u.pick(w.rng, SKINS),
      health: o.cop ? 100 : 36, alive: true, cop: !!o.cop,
      flee: 0, fearX: 0, fearY: 0, fire: 0, punch: 0,
      walk: w.rng() * 6, corpse: 0, speed: o.cop ? 112 : u.rand(w.rng, 42, 70),
      scale: u.rand(w.rng, 0.92, 1.08) // a little height variety keeps the sidewalk crowd natural
    };
    w.peds.push(ped);
    return ped;
  };

  SB.spawnInitial = function (w) {
    const r = w.rng;
    for (let i = 0; i < T.cars; i += 1) {
      const dir = Math.floor(r() * 4);
      const line = Math.floor(r() * SB.NODES);
      const along = u.rand(r, 60, 1440);
      const offset = dir === 0 ? 19 : dir === 2 ? -19 : dir === 1 ? -19 : 19;
      const x = dir % 2 === 0 ? along : line * G + offset;
      const y = dir % 2 === 0 ? line * G + offset : along;
      if (u.dist(x, y, SB.PLAYER.respawnX, SB.PLAYER.respawnY) < 140) continue;
      SB.spawnTrafficCar(w, x, y, dir);
    }
    // Parked cars, including the two job vehicles. These have no AI until stolen.
    const parked = [
      [560, 619, -Math.PI / 2, 'sedan'], [961, 619, Math.PI / 2, 'sports'],
      [720, 619, 0, 'delivery'], [318, 930, 0, 'van'], [1181, 318, Math.PI / 2, 'taxi'],
      [600, 1218, 0, 'sedan'], [1500, 919, Math.PI / 2, 'sports'], [241, 540, -Math.PI / 2, 'van'],
      [919, 90, 0, 'sedan'], [1220, 1500, Math.PI, 'taxi'], [90, 1219, Math.PI / 2, 'sedan'],
      [780, 281, 0, 'delivery'], [1081, 1080, Math.PI / 2, 'sports'], [420, 281, 0, 'sedan']
    ];
    for (const p of parked) SB.makeCar(w, p[0], p[1], p[2], p[3], null, { health: SB.CAR.health });
    for (let i = 0; i < T.peds; i += 1) SB.spawnPed(w);
  };

  function nextWaypoint(w, car) {
    const ai = car.ai;
    const here = ai.node;
    let dir = ai.dir;
    const threatNear = ai.flee > 0 || (w.time - w.lastGunshot < 2.5 && u.dist(car.x, car.y, w.player.x, w.player.y) < 360);
    if (threatNear) {
      ai.flee = Math.max(ai.flee, 3);
      dir = (dir + (w.rng() < 0.5 ? 1 : 3)) % 4;
    } else if (w.rng() < 0.28) {
      dir = (dir + (w.rng() < 0.5 ? 1 : 3)) % 4;
    }
    ai.dir = dir;
    const delta = DIRS[dir];
    ai.node = {
      i: u.clamp(here.i + delta.i, 0, SB.NODES - 1),
      j: u.clamp(here.j + delta.j, 0, SB.NODES - 1)
    };
    if (ai.node.i === here.i && ai.node.j === here.j) { ai.node = here; ai.dir = (dir + 2) % 4; }
    const wp = laneOffset(ai.dir, ai.node);
    ai.wx = wp.x; ai.wy = wp.y;
  }

  SB.updateTraffic = function (w, dt) {
    for (const car of w.cars) {
      if (!car.ai || car.ai.rival || car.isCop || car.dead || car.player) continue;
      const ai = car.ai;
      ai.flee = Math.max(0, ai.flee - dt);
      if (ai.wx == null || u.dist(car.x, car.y, ai.wx, ai.wy) < 46) nextWaypoint(w, car);
      const dx = ai.wx - car.x, dy = ai.wy - car.y;
      const target = Math.atan2(dy, dx);
      const steer = u.clamp(u.angleDiff(target, car.angle) * 2.4, -1, 1);
      let throttle = 0.62;
      if (Math.abs(u.angleDiff(target, car.angle)) > 1.1) throttle = 0.25;
      if (ai.flee > 0) throttle = 1;
      // Yield: ease off when another car sits just ahead.
      ai.yield -= dt;
      if (ai.yield <= 0) {
        ai.yield = 0.25;
        for (const other of w.cars) {
          if (other === car || other.dead) continue;
          const d = u.dist(other.x, other.y, car.x, car.y);
          if (d > 55 || d < 1) continue;
          const toward = Math.atan2(other.y - car.y, other.x - car.x);
          if (Math.abs(u.angleDiff(toward, car.angle)) < 0.7) { throttle = 0; break; }
        }
      }
      SB.driveCar(w, car, throttle, steer, false, dt);
    }
  };

  SB.hurtPed = function (w, ped, damage, source) {
    if (!ped.alive) return;
    ped.health -= damage;
    SB.effects.burst(w, ped.x, ped.y, 'blood', damage > 40 ? 12 : 4);
    if (ped.health <= 0) {
      ped.alive = false;
      ped.corpse = 18;
      w.stats.kills += 1;
      const fromPlayer = (source && source.team === 'player') || (source && source === w.player.inCar);
      if (fromPlayer) SB.raiseWanted(w, ped.cop ? 2 : 1, ped.cop ? 'cop killed' : 'pedestrian killed');
      if (!ped.cop && w.rng() < 0.45) SB.addPickup(w, ped.x, ped.y, 'cash', 20 + Math.floor(w.rng() * 60));
      if (ped.cop) SB.addPickup(w, ped.x, ped.y, 'ammo', 12);
    } else {
      ped.flee = 4;
      const sx = source ? source.x : w.player.x, sy = source ? source.y : w.player.y;
      const a = Math.atan2(ped.y - sy, ped.x - sx);
      ped.fearX = ped.x + Math.cos(a) * 180; ped.fearY = ped.y + Math.sin(a) * 180;
    }
  };

  SB.newPedTarget = function (w, ped) {
    for (let i = 0; i < 30; i += 1) {
      const a = w.rng() * Math.PI * 2;
      const x = ped.x + Math.cos(a) * u.rand(w.rng, 40, 150);
      const y = ped.y + Math.sin(a) * u.rand(w.rng, 40, 150);
      if (w.city.isSidewalk(x, y) && !w.city.buildingAt(x, y)) { ped.tx = x; ped.ty = y; return; }
    }
    const p = w.city.randomSidewalkPoint(w.rng);
    ped.tx = p.x; ped.ty = p.y;
  };

  SB.updatePeds = function (w, dt) {
    for (const ped of w.peds) {
      if (ped.cop) continue;
      if (!ped.alive) { ped.corpse -= dt; continue; }
      if (w.time - w.lastGunshot < 1.5 && u.dist(ped.x, ped.y, w.player.x, w.player.y) < 300 && !ped.flee) {
        ped.flee = 4;
        ped.fearX = ped.x + (ped.x - w.player.x) * 1.4;
        ped.fearY = ped.y + (ped.y - w.player.y) * 1.4;
      }
      ped.flee = Math.max(0, ped.flee - dt);
      const tx = ped.flee > 0 ? ped.fearX : ped.tx;
      const ty = ped.flee > 0 ? ped.fearY : ped.ty;
      if (u.dist(ped.x, ped.y, tx, ty) < 12) {
        if (ped.flee > 0) ped.flee = 0;
        SB.newPedTarget(w, ped);
      }
      const a = Math.atan2(ty - ped.y, tx - ped.x);
      ped.angle = u.turnToward(ped.angle, a, 7 * dt);
      const speed = ped.flee > 0 ? 160 : ped.speed;
      const hit = w.city.resolveCircle(ped.x + Math.cos(a) * speed * dt, ped.y + Math.sin(a) * speed * dt, 7);
      ped.x = hit.x; ped.y = hit.y;
      ped.walk += speed * dt * 0.12;
    }
    for (let i = w.peds.length - 1; i >= 0; i -= 1) {
      const ped = w.peds[i];
      if (!ped.alive && ped.corpse <= 0 && w.peds.length > 20) w.peds.splice(i, 1);
    }
  };

  SB.drawPed = function (ctx, ped, w) {
    ctx.save(); ctx.translate(ped.x, ped.y); ctx.scale(ped.scale, ped.scale);
    if (!ped.alive) {
      ctx.globalAlpha = u.clamp(ped.corpse / 6, 0, 0.8);
      ctx.fillStyle = '#9c3030';
      ctx.beginPath(); ctx.ellipse(0, 0, 13, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = ped.color;
      ctx.beginPath(); ctx.ellipse(2, 0, 8, 5, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.restore(); return;
    }
    ctx.fillStyle = P.shadow;
    ctx.beginPath(); ctx.ellipse(3, 4, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(ped.angle + Math.PI / 2);
    const step = Math.sin(ped.walk) * 3;
    ctx.strokeStyle = '#303a3e'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-3, 4); ctx.lineTo(-4 + step, 10); ctx.moveTo(3, 4); ctx.lineTo(4 - step, 10); ctx.stroke();
    ctx.fillStyle = ped.color;
    ctx.fillRect(-6, -5, 12, 11);
    ctx.strokeStyle = ped.skin; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-6, -3); ctx.lineTo(-9 - step, 1); ctx.moveTo(6, -3); ctx.lineTo(9 + step, 1); ctx.stroke();
    ctx.fillStyle = ped.skin;
    ctx.beginPath(); ctx.arc(0, -9, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ped.cop ? '#203b5e' : '#3b2b24';
    ctx.beginPath(); ctx.arc(0, -10, 5, Math.PI, Math.PI * 2); ctx.fill();
    if (ped.cop) { ctx.fillStyle = '#203b5e'; ctx.fillRect(-7, -16, 14, 3); }
    ctx.restore();
  };
})(window.SB = window.SB || {});
