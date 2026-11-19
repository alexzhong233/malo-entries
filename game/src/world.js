// World state: player, cars, peds, cops, bullets and pickups, plus the spatial queries and
// bookkeeping shared by every system. Systems after this file mutate state; nothing draws here.
(function (SB) {
  'use strict';
  const u = SB.u, P = SB.PLAYER, W = SB.WORLD;

  SB.createWorld = function (seed) {
    const w = {
      seed, rng: SB.rng(seed), city: SB.createCity(seed),
      time: 0, clock: SB.DAY.start, money: 280, screen: 'start',
      player: {
        x: P.respawnX, y: P.respawnY, angle: -Math.PI / 2,
        aimX: P.respawnX + 100, aimY: P.respawnY,
        health: P.maxHealth, inCar: null, gun: true, ammo: P.ammo,
        fire: 0, punch: 0, muzzle: 0, fist: 0, walk: 0, hurt: 0,
        hotwire: 0, hotwireTarget: null, moving: false, sprinting: false
      },
      cars: [], peds: [], cops: [], bullets: [], pickups: [],
      wanted: 0, unseen: 0, copTimer: 6, arrest: 0,
      lastGunshot: -99, lastExplosion: -99,
      banner: { text: '', sub: '', time: 0 },
      mission: {
        index: 0, stage: 0, target: { x: 600, y: 540 }, car: null, counter: 0,
        done: false, gap: 0, extra: '', rivals: [], rivalCars: [], boss: null, chaseTime: 0
      },
      dialog: null,
      stats: { kills: 0, cars: 0, missions: 0 },
      effects: SB.effects.create(), camera: SB.camera.create(),
      objective: 'Welcome to Solara Bay', district: '', street: ''
    };
    return w;
  };

  SB.resetWorld = function (w, opts) {
    const options = opts || {};
    if (Number.isInteger(options.seed)) {
      w.seed = options.seed;
      w.city = SB.createCity(options.seed);
    }
    w.rng = SB.rng(w.seed + Math.floor(w.time * 1000) + 1);
    w.time = 0;
    w.clock = options.clock == null ? SB.DAY.start : options.clock;
    w.money = options.money == null ? 280 : options.money;
    w.screen = 'play';
    w.cars.length = 0; w.peds.length = 0; w.cops.length = 0;
    w.bullets.length = 0; w.pickups.length = 0;
    w.wanted = 0; w.unseen = 0; w.copTimer = 8; w.arrest = 0;
    w.lastLoss = 0; // a fresh run has no booking fee left over from the previous one
    w.lastGunshot = -99; w.lastExplosion = -99;
    w.effects = SB.effects.create();
    w.camera = SB.camera.create();
    w.camera.x = P.respawnX; w.camera.y = P.respawnY;
    w.stats = { kills: 0, cars: 0, missions: 0 };
    w.mission = {
      index: options.missionIndex || 0, stage: 0,
      target: { x: 600, y: 540 }, car: null, counter: 0, done: false, gap: 0,
      extra: '', rivals: [], rivalCars: [], boss: null, chaseTime: 0
    };
    w.dialog = null;
    const p = w.player;
    p.x = P.respawnX; p.y = P.respawnY; p.angle = -Math.PI / 2;
    p.health = P.maxHealth; p.inCar = null; p.gun = true; p.ammo = P.ammo;
    p.fire = 0; p.punch = 0; p.muzzle = 0; p.fist = 0; p.hotwire = 0;
    p.hotwireTarget = null; p.hurt = 0;
    w.banner.time = 0;
    SB.spawnInitial(w);
    SB.missions.begin(w);
  };

  SB.respawn = function (w) {
    const p = w.player;
    p.inCar = null; p.health = P.maxHealth; p.ammo = Math.max(p.ammo, 18);
    p.x = P.respawnX; p.y = P.respawnY; p.angle = -Math.PI / 2;
    p.hotwire = 0; p.hotwireTarget = null; p.hurt = 0;
    w.wanted = 0; w.unseen = 0; w.arrest = 0; w.copTimer = 10;
    w.bullets.length = 0;
    // A clean slate: old gunshot noise must not panic fresh pedestrians on the respawn street.
    w.lastGunshot = -99; w.lastExplosion = -99;
    w.camera.x = p.x; w.camera.y = p.y;
    w.screen = 'play';
    SB.say(w, 'Back on the street.', 'Watch your step out there.', 3);
  };

  SB.say = function (w, text, sub, duration) {
    w.banner.text = text || '';
    w.banner.sub = sub || '';
    w.banner.time = duration || 3.4;
  };

  SB.downPlayer = function (w, kind) {
    if (w.screen !== 'play') return;
    w.screen = kind === 'busted' ? 'busted' : 'wasted';
    const loss = Math.max(0, Math.floor(w.money * 0.25));
    w.money -= loss;
    w.lastLoss = loss;
    w.wanted = 0;
    const p = w.player;
    if (p.inCar) { p.inCar.occupied = false; p.inCar.player = false; p.inCar = null; }
    p.hotwire = 0;
    SB.effects.burst(w, p.x, p.y, 'blood', 14);
  };

  SB.addBullet = function (w, x, y, angle, team, damage, spread) {
    const a = angle + (spread ? (w.rng() - 0.5) * spread : 0);
    const speed = team === 'cop' ? 640 : 780;
    w.bullets.push({ x, y, px: x, py: y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      life: 1.35, team, damage: damage || 18 });
  };

  SB.addPickup = function (w, x, y, kind, value) {
    if (w.pickups.length >= 40) w.pickups.shift();
    w.pickups.push({ x, y, kind, value, life: 40, bob: w.rng() * 6 });
  };

  SB.nearestCar = function (w, x, y, max, filter) {
    let best = null, bestD = max * max;
    for (const car of w.cars) {
      if (filter && !filter(car)) continue;
      const d = (car.x - x) * (car.x - x) + (car.y - y) * (car.y - y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  };

  SB.nearestPed = function (w, x, y, max, filter) {
    let best = null, bestD = max * max;
    for (const ped of w.peds) {
      if (!ped.alive || (filter && !filter(ped))) continue;
      const d = (ped.x - x) * (ped.x - x) + (ped.y - y) * (ped.y - y);
      if (d < bestD) { bestD = d; best = ped; }
    }
    return best;
  };

  SB.carsNear = function (w, x, y, max) {
    const list = [];
    for (const car of w.cars) if (u.dist(car.x, car.y, x, y) < max) list.push(car);
    return list;
  };

  SB.pedsNear = function (w, x, y, max) {
    const list = [];
    for (const ped of w.peds) if (ped.alive && u.dist(ped.x, ped.y, x, y) < max) list.push(ped);
    return list;
  };

  SB.stepBullets = function (w, dt) {
    const city = w.city;
    for (let i = w.bullets.length - 1; i >= 0; i -= 1) {
      const b = w.bullets[i];
      b.px = b.x; b.py = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
      let done = b.life <= 0 || city.buildingAt(b.x, b.y) !== null ||
        b.x < W.minX || b.x > W.maxX || b.y < W.minY || b.y > W.maxY;
      if (!done && b.team === 'player') {
        for (const ped of w.peds) {
          if (!ped.alive || u.dist(b.x, b.y, ped.x, ped.y) > 12) continue;
          SB.hurtPed(w, ped, b.damage, b);
          done = true; break;
        }
        if (!done) for (const car of w.cars) {
          if (car === w.player.inCar || u.dist(b.x, b.y, car.x, car.y) > 22) continue;
          SB.damageCar(w, car, b.damage * 0.55, b.x, b.y);
          done = true; break;
        }
      } else if (!done && b.team === 'cop') {
        const p = w.player;
        if (p.inCar) {
          if (u.dist(b.x, b.y, p.inCar.x, p.inCar.y) < 24) {
            SB.damageCar(w, p.inCar, b.damage * 0.45, b.x, b.y);
            SB.hurtPlayer(w, b.damage * 0.35, 'shot');
            done = true;
          }
        } else if (u.dist(b.x, b.y, p.x, p.y) < 13) {
          SB.hurtPlayer(w, b.damage, 'shot');
          done = true;
        }
      }
      if (done) {
        SB.effects.burst(w, b.x, b.y, 'spark', 3);
        w.bullets.splice(i, 1);
      }
    }
  };

  SB.stepPickups = function (w, dt) {
    const p = w.player, px = p.inCar ? p.inCar.x : p.x, py = p.inCar ? p.inCar.y : p.y;
    for (let i = w.pickups.length - 1; i >= 0; i -= 1) {
      const item = w.pickups[i];
      item.life -= dt;
      if (u.dist(item.x, item.y, px, py) < (p.inCar ? 34 : 23)) {
        if (item.kind === 'cash') { w.money += item.value; SB.say(w, '+' + u.money(item.value), 'Picked up cash', 1.6); }
        else if (item.kind === 'health') { p.health = Math.min(P.maxHealth, p.health + item.value); SB.say(w, 'Health restored', '', 1.6); }
        else { p.ammo += item.value; SB.say(w, '+ ' + item.value + ' rounds', '', 1.6); }
        SB.effects.burst(w, item.x, item.y, 'spark', 6);
        w.pickups.splice(i, 1);
      } else if (item.life <= 0) w.pickups.splice(i, 1);
    }
  };

  SB.hurtPlayer = function (w, amount, reason) {
    const p = w.player;
    if (w.screen !== 'play' || p.hurt > 0.55 && reason === 'ram') return;
    p.health -= amount;
    p.hurt = 0.2;
    SB.effects.burst(w, p.x, p.y, 'blood', 4);
    if (p.health <= 0) SB.downPlayer(w, w.wanted > 0 && reason !== 'explosion' ? 'busted' : 'wasted');
  };
})(window.SB = window.SB || {});
