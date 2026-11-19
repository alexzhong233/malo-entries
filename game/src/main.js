/* SOLARA BAY - bootstrap, game state, fixed-step simulation and debug hooks. */
(function () {
  'use strict';
  const SB = window.SB;
  const C = SB.C, U = SB.U;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const Game = {
    state: 'menu',
    cash: 350,
    elapsed: 0,
    saveTimer: 0
  };
  SB.Game = Game;

  function resize() {
    canvas.width = Math.max(640, window.innerWidth);
    canvas.height = Math.max(400, window.innerHeight);
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', resize);
  resize();

  function start(useSave) {
    const data = (useSave && SB.Save.load()) || SB.Save.fresh();
    SB.World.init();
    SB.Vehicles.reset();
    SB.Effects.reset();
    SB.Combat.clear();
    SB.Player.reset(data);
    SB.Traffic.init();
    SB.Police.init(SB.Player.state);
    SB.Missions.index = data.mission;
    SB.Missions.active = null;
    SB.Missions.failed = false;
    SB.Missions.stageIndex = -1;
    Game.cash = data.cash;
    Game.elapsed = data.seconds || 0;
    Game.saveTimer = 0;
    // Begin in warm daylight; the cycle keeps advancing from there.
    SB.World.time = C.DAY_LENGTH * 0.34 + ((data.seconds || 0) % C.DAY_LENGTH);
    SB.Render.cam.ready = false;
    Game.state = 'playing';
    SB.Screens.controls = false;
    SB.Screens.banner('WELCOME TO SOLARA BAY', 'Press J to take a job, E to steal a car, and enjoy the sun.', 4.5);
    if (!useSave) SB.Save.clear();
    SB.Audio.blip(560, 0.2);
  }

  function handleInput() {
    const input = SB.Input;
    if (input.pressed('KeyM')) SB.Audio.toggle();
    if (input.pressed('Tab')) SB.Minimap.toggle();
    if (input.pressed('KeyC')) SB.Screens.toggleControls();

    if (Game.state === 'menu') {
      const list = SB.Screens.buttons(canvas.width, canvas.height, SB.Save.hasSave());
      let hover = '';
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (Math.abs(input.mouse.x - b.x) < b.w / 2 && Math.abs(input.mouse.y - b.y) < b.h / 2) hover = b.id;
      }
      SB.Screens.hover = hover;
      let choice = null;
      if (input.pressed('Enter') || input.pressed('NumpadEnter')) choice = 'new';
      if (input.pressed('KeyL')) choice = 'continue';
      if (input.mouse.clicked) choice = SB.Screens.click(input.mouse.x, input.mouse.y,
        canvas.width, canvas.height, SB.Save.hasSave(), Game);
      if (choice === 'new') start(false);
      else if (choice === 'continue') start(true);
    } else if (Game.state === 'playing') {
      if (input.pressed('Escape')) {
        Game.state = 'paused';
        SB.Audio.setEngine(0, false);
      } else if (!SB.Screens.controls && !SB.Missions.active) {
        if (input.pressed('KeyJ')) SB.Missions.start(SB.Missions.index < 7 ? SB.Missions.index : 0);
        for (let i = 1; i <= 7; i++) {
          if (input.pressed('Digit' + i) || input.pressed('Numpad' + i)) SB.Missions.start(i - 1);
        }
      }
    } else if (Game.state === 'paused') {
      if (input.pressed('Escape') && !SB.Screens.controls) Game.state = 'playing';
      if (input.pressed('Enter')) Game.state = 'menu';
    } else if (Game.state === 'gameover') {
      if (input.pressed('KeyR')) {
        SB.Missions.retry();
        SB.Player.state.health = 100;
        Game.state = 'playing';
      }
      if (input.pressed('Enter')) Game.state = 'menu';
    }
  }

  function update(dt) {
    const p = SB.Player.state;
    SB.World.time += dt;
    Game.elapsed += dt;
    SB.Missions.update(dt, SB.Input);
    SB.Player.update(dt, SB.Input);
    SB.Traffic.update(dt);
    SB.Police.update(dt, p);
    SB.Vehicles.update(dt);
    SB.Combat.update(dt);
    SB.Effects.update(dt);
    SB.Render.updateCamera(dt, p);
    SB.Screens.update(dt);
    SB.Audio.setEngine(p.inCar ? p.inCar.speed() : 0, !!p.inCar);
    SB.Audio.setWaves(p.x - SB.World.shore(p.y));
    Game.saveTimer += dt;
    if (Game.saveTimer > 9 && p.health > 0) {
      Game.saveTimer = 0;
      SB.Save.write(Game);
    }
  }

  Game.onDeath = function () {
    if (SB.Missions.active) SB.Missions.fail('You went down');
    Game.state = 'gameover';
    SB.Audio.setEngine(0, false);
    SB.Audio.setSiren(0, false);
    SB.Effects.shake(18);
  };

  // Boot with a live, sunlit city behind the title screen.
  SB.World.time = C.DAY_LENGTH * 0.34;
  SB.World.init();
  SB.Vehicles.reset();
  SB.Traffic.init();
  SB.Player.reset(SB.Save.fresh());
  SB.Render.init(canvas, ctx);
  SB.Input.init(canvas);

  let last = 0, acc = 0;
  const STEP = 1 / 60;
  function frame(ts) {
    const dt = last ? Math.min(0.12, (ts - last) / 1000) : STEP;
    last = ts;
    acc += dt;
    let guard = 0;
    while (acc >= STEP && guard++ < 8) {
      handleInput();
      if (Game.state === 'playing') update(STEP);
      else {
        SB.Effects.update(STEP * 0.5);
        SB.Screens.update(STEP);
      }
      acc -= STEP;
      SB.Input.endFrame();
    }
    SB.Render.draw(Game);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Small, deterministic hooks used by the screenshot recorder and manual testing.
  SB.debug = {
    teleport: function (x, y, a) {
      const p = SB.Player.state;
      if (p.inCar) {
        p.inCar.x = x; p.inCar.y = y;
        if (a !== undefined) p.inCar.a = a;
        p.inCar.vx = 0; p.inCar.vy = 0;
      }
      p.x = x; p.y = y;
      SB.Render.cam.ready = false;
    },
    drive: function (x, y, a, speed) {
      const p = SB.Player.state;
      if (p.inCar) SB.Player.exitCar();
      const v = SB.Vehicles.spawn(x, y, a || 0, { kind: 'civilian', color: '#f2c95f' });
      v.vx = Math.cos(a || 0) * (speed || 140);
      v.vy = Math.sin(a || 0) * (speed || 140);
      v.occupied = true;
      p.inCar = v;
      p.x = x; p.y = y;
      SB.Render.cam.ready = false;
      return v;
    },
    wanted: function (n) {
      const p = SB.Player.state;
      SB.Police.setWanted(n || 3);
      for (let i = 0; i < Math.min(3, n || 3); i++) SB.Police.spawnChaser(p);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.4;
        const x = p.x + Math.cos(a) * 300, y = p.y + Math.sin(a) * 300;
        if (SB.World.solid(x, y, 22)) continue;
        const v = SB.Vehicles.spawn(x, y, Math.atan2(p.y - y, p.x - x),
          { kind: 'police', maxSpeed: 350, accel: 310 });
        SB.Police.cars.push(v);
      }
    },
    trafficBurst: function (x, y) {
      for (let i = 1; i <= 5; i++) {
        const vx = x + i * 150;
        const v = SB.Vehicles.spawn(vx, y + 11, 0,
          { kind: 'civilian', maxSpeed: 210, accel: 180 });
        SB.Traffic.assign(v, 'h', y, 1);
        v.x = vx;
        v.vx = 110; v.vy = 0;
        SB.Traffic.cars.push(v);
      }
    },
    mission: function (i) {
      Game.state = 'playing';
      SB.Missions.start(U.clamp(i, 0, 6));
    },
    clock: function (v) { SB.World.time = v; },
    cash: function (n) { Game.cash = n; },
    health: function (n) { SB.Player.state.health = n; }
  };
})();
