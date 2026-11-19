(function (SB) {
  'use strict';

  var CFG = SB.CFG, U = SB.U, CITY = SB.City;

  function spawnPed(world, x, y) {
    var rng = world.rng;
    var colors = ['#f4d06f', '#e96f61', '#5fb2c9', '#b98bd7', '#f2f2e8', '#4f6b8a', '#78b96a'];
    return {
      x: x, y: y, angle: rng() * U.TAU,
      speed: U.range(rng, 38, 66),
      wx: x, wy: y, phase: rng() * 10,
      shirt: U.pick(rng, colors),
      skin: U.pick(rng, ['#8d5b3f', '#c68a62', '#e7b78d', '#5b3d30']),
      panic: 0
    };
  }

  function newPedWaypoint(world, ped) {
    var rng = world.rng, p = CITY.randomRoadPoint(world.city, rng);
    var off = CFG.ROAD_W * 0.5 + CFG.SIDEWALK * 0.6;
    if (rng() > 0.5) off = -off;
    var x = p.x + (p.vertical ? off : 0), y = p.y + (p.vertical ? 0 : off);
    if (!CITY.blocked(world.city, x, y, 8)) { ped.wx = x; ped.wy = y; }
    else { ped.wx = U.clamp(ped.x + U.range(rng, -160, 160), 50, CFG.WORLD_W - 50);
           ped.wy = U.clamp(ped.y + U.range(rng, -160, 160), 50, CFG.WORLD_H - 50); }
  }

  function create(city, save) {
    save = save || {};
    var rng = U.rng(0x51a2a + Math.floor(Math.random() * 100000));
    var spawn = save.position || CFG.LANDMARKS.spawn;
    var world = {
      city: city,
      rng: rng,
      elapsed: 0,
      clock: CFG.START_HOUR,
      state: 'start',
      menuIndex: 0,
      cash: typeof save.cash === 'number' ? save.cash : 350,
      wanted: 0,
      heat: 0,
      seenTimer: 0,
      lostTimer: 0,
      lastCrime: '',
      player: SB.Player.create(spawn.x, spawn.y),
      camera: { x: spawn.x, y: spawn.y, zoom: CFG.CAMERA.ZOOM, shake: 0, shakeX: 0, shakeY: 0 },
      traffic: [], police: [], officers: [], bullets: [], peds: [], targets: [],
      mission: null,
      missionIndex: typeof save.missionIndex === 'number' ? U.clamp(save.missionIndex, 0, 6) : 0,
      completed: save.completed ? save.completed.slice() : [false, false, false, false, false, false, false],
      notifications: [],
      banner: null,
      dialog: null,
      missionPrompt: 0,
      saveTimer: 0,
      roadblockTimer: 26,
      frame: 0,
      stats: { stolen: 0, shots: 0, distance: 0, jobs: 0 },
      headlights: false
    };
    for (var i = 0; i < 85; i++) {
      var rp = CITY.randomRoadPoint(city, rng);
      var off = CFG.ROAD_W * 0.5 + 10;
      var px = rp.x + (rp.vertical ? off : 0), py = rp.y + (rp.vertical ? 0 : off);
      if (!CITY.blocked(city, px, py, 9)) world.peds.push(spawnPed(world, px, py));
    }
    return world;
  }

  function sunLevel(world) {
    var h = world.clock % 24;
    var t = (h - 5.5) / 14.0;
    return U.clamp(Math.sin(t * Math.PI), 0, 1);
  }

  function update(world, dt) {
    world.elapsed += dt;
    world.clock = (CFG.START_HOUR + world.elapsed / CFG.DAY_LENGTH * 24) % 24;
    if (world.camera.shake > 0) world.camera.shake = Math.max(0, world.camera.shake - dt * 24);

    var i, n;
    for (i = 0; i < world.notifications.length; i++) {
      world.notifications[i].t += dt;
    }
    world.notifications = world.notifications.filter(function (m) { return m.t < m.life; });
    if (world.banner) {
      world.banner.t += dt;
      if (world.banner.t > world.banner.life) world.banner = null;
    }
    if (world.dialog) {
      world.dialog.t += dt;
      if (world.dialog.t > world.dialog.life) world.dialog = null;
    }

    // Pedestrians scatter from gunfire and high-speed chases.
    var p = world.player;
    for (i = 0; i < world.peds.length; i++) {
      var ped = world.peds[i];
      if (U.dist2(ped.x, ped.y, world.camera.x, world.camera.y) > 1700 * 1700) continue;
      var d = U.dist(ped.x, ped.y, p.x, p.y);
      if (d < 170 && (world.wanted > 0 || p.shootFlash > 0)) ped.panic = 3.5;
      if (ped.panic > 0) {
        ped.panic -= dt;
        ped.speed = 128;
      } else ped.speed = U.lerp(ped.speed, 52, dt * 2);
      if (U.dist2(ped.x, ped.y, ped.wx, ped.wy) < 20 * 20 || world.rng() < dt * 0.05) {
        newPedWaypoint(world, ped);
      }
      var a = Math.atan2(ped.wy - ped.y, ped.wx - ped.x);
      ped.angle = U.angleLerp(ped.angle, a, Math.min(1, dt * 7));
      var vx = Math.cos(ped.angle) * ped.speed, vy = Math.sin(ped.angle) * ped.speed;
      if (!CITY.blocked(world.city, ped.x + vx * dt, ped.y + vy * dt, 8)) {
        ped.x += vx * dt; ped.y += vy * dt; ped.phase += dt * ped.speed * 0.09;
      } else newPedWaypoint(world, ped);
    }
    // Keep the population from drifting into the sea or inside a mall.
    for (i = world.peds.length - 1; i >= 0; i--) {
      if (CITY.blocked(world.city, world.peds[i].x, world.peds[i].y, 5)) world.peds.splice(i, 1);
    }
    while (world.peds.length < 70) {
      var rp = CITY.randomRoadPoint(world.city, world.rng);
      var off2 = CFG.ROAD_W * 0.5 + 12;
      var qx = rp.x + (rp.vertical ? off2 : 0), qy = rp.y + (rp.vertical ? 0 : off2);
      if (!CITY.blocked(world.city, qx, qy, 9)) world.peds.push(spawnPed(world, qx, qy));
    }
  }

  // Axis-separated circle collision gives a nice sliding feel against walls.
  function move(world, ent, dx, dy, r) {
    var hit = false;
    if (dx !== 0 && !CITY.blocked(world.city, ent.x + dx, ent.y, r)) ent.x += dx;
    else if (dx !== 0) hit = true;
    if (dy !== 0 && !CITY.blocked(world.city, ent.x, ent.y + dy, r)) ent.y += dy;
    else if (dy !== 0) hit = true;
    return hit;
  }

  function clearSpot(world, x, y, r) {
    if (!CITY.blocked(world.city, x, y, r)) return { x: x, y: y };
    for (var ring = 1; ring < 14; ring++) {
      for (var a = 0; a < 12; a++) {
        var ang = a / 12 * U.TAU;
        var nx = x + Math.cos(ang) * ring * 34, ny = y + Math.sin(ang) * ring * 34;
        if (!CITY.blocked(world.city, nx, ny, r)) return { x: nx, y: ny };
      }
    }
    return { x: CFG.LANDMARKS.spawn.x, y: CFG.LANDMARKS.spawn.y };
  }

  function notify(world, text, color, life) {
    world.notifications.push({ text: text, color: color || CFG.COLORS.hud, t: 0, life: life || 3.2 });
    if (world.notifications.length > 5) world.notifications.shift();
  }

  function say(world, speaker, text, life) {
    world.dialog = { speaker: speaker, text: text, t: 0, life: life || 6.5 };
  }

  function revive(world) {
    var spot = clearSpot(world, CFG.LANDMARKS.spawn.x, CFG.LANDMARKS.spawn.y, 20);
    var p = world.player;
    p.health = CFG.PLAYER.MAX_HEALTH;
    p.alive = true;
    p.x = spot.x; p.y = spot.y; p.car = null;
    p.vx = 0; p.vy = 0;
    world.wanted = 0; world.heat = 0;
    world.police.length = 0; world.officers.length = 0;
    world.state = 'playing';
    world.camera.x = p.x; world.camera.y = p.y;
    notify(world, 'You wake up on the boardwalk. Keep your head down.', '#ffd45e', 4.5);
  }

  SB.World = {
    create: create, update: update, move: move, sunLevel: sunLevel, clearSpot: clearSpot,
    notify: notify, say: say, revive: revive, spawnPed: spawnPed
  };
})(window.SB = window.SB || {});
