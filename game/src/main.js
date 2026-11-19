(function (SB) {
  'use strict';

  var CFG = SB.CFG, U = SB.U;
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d', { alpha: false });
  var city = SB.City.generate(77123);
  var world = SB.World.create(city, null);
  var controlsReturn = 'start';
  var accumulator = 0, lastTime = 0;
  var STEP = 1 / 60;

  SB.view = { w: 1280, h: 720, dpr: 1 };

  function resize() {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = Math.max(320, window.innerWidth), h = Math.max(240, window.innerHeight);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    SB.view.w = w; SB.view.h = h; SB.view.dpr = dpr;
    ctx.imageSmoothingEnabled = false;
  }

  function freshWorld(save) {
    world = SB.World.create(city, save || null);
    world.mapZoom = 1;
    SB.FX.reset();
    SB.Traffic.init(world);
    SB.Player.spawnParked(world, 16);
    SB.World.notify(world, save ? 'Welcome back to Solara Bay.' : 'Welcome to Solara Bay. Find the gold job marker.', '#ffd45e', 4.5);
    return world;
  }

  var Game = {
    newGame: function () {
      SB.Save.clear();
      freshWorld(null);
      world.state = 'playing';
      SB.Audio.init(); SB.Audio.resume(); SB.Audio.ui();
    },
    continueGame: function () {
      var save = SB.Save.read();
      if (!save) { Game.newGame(); return; }
      freshWorld(save);
      if (typeof save.clock === 'number') {
        world.elapsed = ((save.clock - CFG.START_HOUR + 24) % 24) / 24 * CFG.DAY_LENGTH;
      }
      if (save.stats) world.stats = {
        stolen: save.stats.stolen || 0, shots: save.stats.shots || 0,
        distance: save.stats.distance || 0, jobs: save.stats.jobs || 0
      };
      world.state = 'playing';
      SB.Audio.init(); SB.Audio.resume(); SB.Audio.ui();
    },
    showControls: function (from) {
      controlsReturn = from || world.state;
      world.state = 'controls';
      SB.Audio.ui();
    },
    closeControls: function () {
      world.state = controlsReturn === 'controls' ? 'playing' : controlsReturn;
      SB.Audio.ui();
    },
    resume: function () { world.state = 'playing'; world.menuIndex = 0; SB.Audio.ui(); },
    respawn: function () {
      SB.Missions.fail(world, 'The job is off. Lay low and try again.');
      SB.World.revive(world);
      SB.Traffic.init(world);
      SB.Save.write(world);
    }
  };
  SB.Game = Game;
  SB.world = function () { return world; };

  function handleGlobalKeys() {
    var I = SB.Input;
    if (I.just('Tab')) {
      world.mapZoom = world.mapZoom > 1 ? 1 : 2;
      SB.Audio.ui();
      I.consume('Tab');
    }
    if (I.just('KeyC') && (world.state === 'playing' || world.state === 'paused')) {
      Game.showControls(world.state);
      I.consume('KeyC');
    }
    if (I.just('Escape') && (world.state === 'playing' || world.state === 'paused')) {
      world.state = world.state === 'playing' ? 'paused' : 'playing';
      world.menuIndex = 0;
      SB.Audio.ui();
      I.consume('Escape');
    }
    if (world.state === 'gameover' && I.just('Enter')) Game.respawn();
  }

  function update(dt) {
    handleGlobalKeys();
    if (world.state === 'playing') {
      SB.Render.updateCamera(world, dt);
      SB.World.update(world, dt);
      SB.FX.update(world, dt);
      SB.Player.update(world, dt);
      SB.Traffic.update(world, dt);
      SB.Police.update(world, dt);
      SB.Player.updateBullets(world, dt);
      SB.Missions.update(world, dt);
      SB.Audio.update(world);
      world.saveTimer += dt;
      if (world.saveTimer > 12) { world.saveTimer = 0; SB.Save.write(world); }
    } else {
      world.elapsed += dt * 0.35;
      world.clock = (CFG.START_HOUR + world.elapsed / CFG.DAY_LENGTH * 24) % 24;
      SB.FX.update(world, dt);
      SB.Render.updateCamera(world, dt);
      if (world.state === 'start') {
        var sp = CFG.LANDMARKS.spawn;
        world.camera.x = sp.x + Math.sin(world.elapsed * 0.12) * 260;
        world.camera.y = sp.y + Math.cos(world.elapsed * 0.09) * 180;
      }
    }
  }

  function frame(now) {
    if (!lastTime) lastTime = now;
    var dt = Math.min(0.2, (now - lastTime) / 1000);
    lastTime = now;
    accumulator += dt;
    var guard = 0, stepped = false;
    while (accumulator >= STEP && guard++ < 6) {
      update(STEP);
      accumulator -= STEP;
      stepped = true;
    }
    SB.Render.draw(ctx, world);
    SB.HUD.draw(ctx, world);
    SB.Minimap.draw(ctx, world);
    SB.Screens.draw(ctx, world);
    if (stepped) SB.Input.endFrame();
    requestAnimationFrame(frame);
  }

  // Scene helpers are used by the screenshot recorder, never by normal play.
  function onRoad(x, y, angle, lane) {
    var pt = SB.City.nearestRoadPoint(city, x, y);
    return { x: pt.x + (angle === 0 || angle === Math.PI ? 0 : (lane || 12)),
      y: pt.y + (angle === 0 || angle === Math.PI ? (lane || 12) : 0) };
  }

  function putPlayerInCar(car) {
    SB.Player.enterCar(world, world.player, car);
    world.camera.x = car.x; world.camera.y = car.y;
  }

  function debugScene(name) {
    Game.newGame();
    var p = world.player, i;
    if (name === 'foot') {
      p.x = 760; p.y = 1180; p.angle = -0.6;
      p.vx = 0; p.vy = 0;
      world.camera.x = p.x; world.camera.y = p.y;
      SB.FX.spark(p.x + 30, p.y - 20, '#ffd45e', 10);
      SB.World.notify(world, 'BEACH PACKAGE AVAILABLE', '#ffd45e', 8);
    } else if (name === 'drive') {
      world.traffic.length = 0;
      var base = { x: 2610, y: 1950 + 13 };
      var car = SB.Vehicles.create(base.x, base.y, 0, { type: 'sport', color: '#e94f43' });
      car.speed = 210; car.vx = 210; car.vy = 0;
      world.traffic.push(car);
      putPlayerInCar(car);
      for (i = 0; i < 5; i++) {
        var tc = SB.Vehicles.create(base.x + 150 + i * 165, base.y + (i % 2) * 8, 0,
          { ai: true, color: CFG.CAR_COLORS[i % CFG.CAR_COLORS.length] });
        tc.axis = 'h'; tc.dir = 1; tc.lane = 13; tc.tx = tc.x + 600; tc.ty = tc.y;
        tc.speed = 140; tc.vx = 140;
        world.traffic.push(tc);
      }
      SB.World.notify(world, 'TRAFFIC  •  W TO ACCELERATE', '#9cf0c0', 5);
    } else if (name === 'police') {
      var pt = onRoad(2610, 3270, -Math.PI / 2, 13);
      var pcar = SB.Vehicles.create(pt.x, pt.y, -Math.PI / 2, { type: 'sport', color: '#f0e9d8' });
      pcar.speed = 190; pcar.vx = 0; pcar.vy = -190;
      world.traffic.push(pcar);
      putPlayerInCar(pcar);
      SB.Police.setWanted(world, 5, 100);
      var spots = [[190, -120], [-230, 90], [260, 190], [-310, -210], [80, 320]];
      for (i = 0; i < spots.length; i++) {
        SB.Police.spawnCop(world, SB.World.clearSpot(world, pt.x + spots[i][0], pt.y + spots[i][1], 26));
      }
      SB.World.notify(world, '5 STAR PURSUIT  •  EVERY UNIT IS RESPONDING', '#ff6b5e', 6);
    } else if (name === 'mission') {
      world.missionIndex = 2;
      world.completed[0] = true; world.completed[1] = true;
      SB.Missions.start(world, 2);
      world.mission.stage = 1;
      SB.Missions.setupStage(world);
      var st = SB.Missions.JOBS[2].stages[1];
      p.x = st._x - 95; p.y = st._y - 65;
      p.vx = 0; p.vy = 0; p.angle = 0.2;
      world.camera.x = p.x; world.camera.y = p.y;
      SB.Police.setWanted(world, 2, 70);
      for (i = 0; i < 2; i++) SB.Police.spawnCop(world, SB.World.clearSpot(world, p.x + 320 + i * 180, p.y - 200 + i * 90, 26));
    }
    SB.Render.updateCamera(world, 0.016);
    return { state: world.state, x: p.x, y: p.y, wanted: world.wanted };
  }

  SB.debug = {
    scene: debugScene,
    newGame: Game.newGame,
    world: function () { return world; },
    stats: function () {
      return { cash: world.cash, wanted: world.wanted, mission: world.missionIndex,
        state: world.state, police: world.police.length, traffic: world.traffic.length };
    },
    teleport: function (x, y) {
      var spot = SB.World.clearSpot(world, x, y, 16);
      world.player.x = spot.x; world.player.y = spot.y;
      world.camera.x = spot.x; world.camera.y = spot.y;
    },
    wanted: function (n) { SB.Police.setWanted(world, n, n * 100); },
    startMission: function (i) { return SB.Missions.start(world, i); },
    missionStage: function (i) {
      if (!world.mission) return false;
      world.mission.stage = i;
      SB.Missions.setupStage(world);
      return true;
    },
    forceStage: function () { if (world.mission) SB.Missions.advance(world); },
    setTime: function (hour) { world.clock = hour; },
    cars: function () { return world.traffic.length; }
  };

  window.addEventListener('resize', resize);
  window.addEventListener('beforeunload', function () {
    if (world.state === 'playing') SB.Save.write(world);
  });
  resize();
  SB.Input.init(canvas);
  SB.Traffic.init(world);
  SB.Player.spawnParked(world, 16);
  world.state = 'start';
  SB.ready = true;
  requestAnimationFrame(frame);
})(window.SB = window.SB || {});
