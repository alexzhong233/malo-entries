// SOLARA BAY boot, menu wiring, fixed 1/60 s simulation, save integration and the deterministic
// ?shot= scenes used by the screenshot recorder. Classic script only: SB is the one global.
(function (SB) {
  'use strict';
  const STEP = SB.STEP, F = SB.FIELD;

  const params = new URLSearchParams(window.location.search);
  const parsed = Number.parseInt(params.get('seed') || '', 10);
  const seed = Number.isInteger(parsed) ? parsed : Math.floor(Math.random() * 4294967296);
  const shot = params.get('shot');
  const shotModes = { foot: 1, drive: 1, police: 1, mission: 1 };
  const shotMode = shotModes[shot] ? shot : null;

  const canvas = document.getElementById('game');
  const status = document.getElementById('status');
  const w = SB.createWorld(seed);
  const renderer = SB.createRenderer(canvas);
  const input = SB.createInput(canvas);
  const audio = SB.audio.create();
  w.audioRef = audio;

  // Handy for the offline smoke tests; the game never reads this back.
  window.__sbWorld = w;
  window.__shotReady = false;
  let shotState = null;

  function announce(message) { status.textContent = message; }
  function wakeAudio() { SB.audio.init(audio); SB.audio.resume(audio); }
  window.addEventListener('keydown', wakeAudio);
  canvas.addEventListener('pointerdown', wakeAudio);

  function saveGame() { return SB.save.write(w); }

  function applyAction(action) {
    if (!action) return;
    if (action === 'new') {
      if (shotMode) { stageShot(shotMode); announce('Solara Bay. Staging ' + shotMode + '.'); return; }
      SB.screens.clearSave();
      SB.resetWorld(w, { money: 280 });
    } else if (action === 'continue') {
      const data = SB.save.read();
      if (!data) {
        SB.resetWorld(w, { money: 280 });
      } else {
        SB.resetWorld(w, { money: data.money, seed: data.seed, clock: data.clock, missionIndex: data.missionIndex });
        SB.save.apply(w, data);
      }
    } else if (action === 'restart') {
      SB.screens.clearSave();
      SB.resetWorld(w, { money: 280 });
    } else if (action === 'resume') {
      w.screen = 'play';
    } else if (action === 'title') {
      saveGame();
      w.screen = 'start';
      SB.screens.selected = 0;
    } else if (action === 'respawn') {
      SB.respawn(w);
    } else if (action === 'controls') {
      SB.screens.prev = w.screen;
      w.screen = 'controls';
    } else if (action === 'back') {
      w.screen = SB.screens.prev === 'play' ? 'pause' : SB.screens.prev || 'start';
    }
    announce('Solara Bay. ' + w.objective);
    input.clear();
  }

  function handleMenu() {
    if (w.screen === 'start' || w.screen === 'pause' || w.screen === 'controls' ||
      w.screen === 'busted' || w.screen === 'wasted') {
      applyAction(SB.screens.update(w, input));
      return;
    }
    if (input.consume('Escape')) {
      w.screen = 'pause';
      SB.screens.selected = 0;
      saveGame();
      announce('Paused.');
    } else if (input.consume('Tab')) {
      SB.missions.restart(w);
      announce(w.objective);
    } else if (input.consume('KeyC')) {
      SB.screens.prev = 'play';
      w.screen = 'controls';
    } else if (input.consume('KeyM')) {
      const on = SB.audio.toggle(audio);
      SB.say(w, on ? 'Audio on' : 'Audio muted', '', 1.4);
    }
  }

  function step(dt, ctrl) {
    if (w.screen !== 'play') return;
    w.time += dt;
    // Wrap with a modulo so the clock stays in range even after a long or throttled step.
    w.clock = (w.clock + dt * SB.DAY.minutesPerSecond) % 1440;
    if (w.banner.time > 0) w.banner.time -= dt;
    SB.updatePlayer(w, ctrl, dt);
    SB.updateTraffic(w, dt);
    SB.stepVehicles(w, dt);
    SB.updatePeds(w, dt);
    SB.updatePolice(w, dt);
    SB.stepBullets(w, dt);
    SB.stepPickups(w, dt);
    SB.missions.update(w, dt);
    SB.effects.update(w, dt);
    SB.camera.update(w.camera, w, dt);
    w.district = w.city.district(w.player.x, w.player.y);
    w.street = w.city.street(w.player.x, w.player.y);
  }

  function runGame() {
    let accumulator = 0;
    let last = performance.now();
    let saveTimer = 20;
    function frame(now) {
      requestAnimationFrame(frame);
      accumulator += Math.min((now - last) / 1000, 0.25);
      last = now;
      handleMenu();
      if (w.screen === 'play') {
        if (!shotState) {
          saveTimer -= accumulator;
          if (saveTimer <= 0) { saveTimer = 20; saveGame(); }
        }
        const ctrl = shotState ? shotState.ctrl : input;
        while (accumulator >= STEP && w.screen === 'play') {
          if (shotState) {
            shotState.script(shotState.elapsed, shotState.ctrl);
            shotState.elapsed += STEP;
            if (!shotState.ready && shotState.elapsed >= 2.5) {
              shotState.ready = true;
              window.__shotReady = true;
            }
          }
          step(STEP, ctrl);
          accumulator -= STEP;
        }
      } else accumulator = 0;
      SB.audio.update(audio, w);
      renderer.draw(w);
    }
    announce('Solara Bay. Press Enter to start.');
    requestAnimationFrame(frame);
    window.addEventListener('beforeunload', function () { if (!shotState) saveGame(); });
    // Background tabs stop animation frames; save before the browser suspends the page.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && !shotState) saveGame();
    });
  }

  // Deterministic scene controls: no keyboard dependency, but the *real* simulation still ticks
  // in the animation loop, so traffic, cops, particles and the camera genuinely move.
  function stub(keys, aimPoint) {
    const mouse = { x: F.width / 2, y: F.height / 2, down: false, click: false, right: false };
    return {
      mouse,
      isDown: function (code) { return !!keys[code]; },
      axis: function (neg, pos) { return (keys[pos] ? 1 : 0) - (keys[neg] ? 1 : 0); },
      consume: function () { return false; },
      clear: function () {},
      aim: function () { return aimPoint; }
    };
  }

  function stageShot(name) {
    SB.resetWorld(w, { money: 1450, seed: seed });
    const keys = {};
    let aimPoint = { x: 780, y: 520 };
    const ctrl = stub(keys, aimPoint);

    if (name === 'foot') {
      for (let i = 0; i < 6; i += 1) SB.spawnPed(w, 660 + (i - 3) * 44, 460 + (i % 2) * 38);
      aimPoint = { x: 780, y: 470 };
    } else if (name === 'drive') {
      const car = SB.makeCar(w, 300, 619, 0, 'sports', '#e34d4d', { player: true });
      car.health = car.maxHealth = 420;   // the staged chase must survive seven seconds of traffic
      w.player.inCar = car; car.player = true; car.occupied = true;
      keys.KeyW = true;
      aimPoint = { x: 1300, y: 619 };
    } else if (name === 'police') {
      SB.raiseWanted(w, 3, 'shots fired near the marina');
      const cars = [
        { x: 880, y: 619, a: Math.PI }, { x: 300, y: 619, a: 0 },
        { x: 600, y: 900, a: -Math.PI / 2 }
      ];
      for (const s of cars) {
        const car = SB.makeCar(w, s.x, s.y, s.a, 'police', '#e9e9e1', {
          cop: true, ai: { fire: 1.2, ram: 0 }
        });
        car.flash = 1;
      }
      SB.spawnPed(w, 790, 560, { cop: true });
      SB.spawnPed(w, 430, 520, { cop: true });
      keys.KeyW = true;
      aimPoint = { x: 600, y: 60 };
    } else if (name === 'mission') {
      w.mission.index = 1;
      SB.missions.begin(w);
      for (let i = 0; i < 4; i += 1) SB.spawnPed(w, 520 + i * 52, 500 + (i % 2) * 44);
      aimPoint = { x: 720, y: 619 };
    }

    // ctrl.aim closes over the initial object, so update the shared point by mutation.
    ctrl.aim = function () { return aimPoint; };
    shotState = {
      name: name, ctrl: ctrl, elapsed: 0, ready: false,
      script: function (t) {
        if (name === 'foot') ctrl.mouse.down = t < 1.4 || (t > 3.25 && t < 4.4);
        else if (name === 'drive') {
          keys.KeyW = true;
          keys.KeyD = t > 2.5 && t < 3.55;
          keys.Space = t > 2.5 && t < 3.55;   // handbrake drift lays skid marks
        }
        else if (name === 'police') { keys.KeyW = true; keys.KeyA = t > 3.2 && t < 4.3; }
      }
    };
    window.__shotReady = false;
    w.screen = 'play';
    renderer.draw(w);
  }

  runGame();
})(window.SB = window.SB || {});
