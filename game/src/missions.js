(function (SB) {
  'use strict';

  var CFG = SB.CFG, U = SB.U, CITY = SB.City, L = CFG.LANDMARKS;

  // Seven hand-written jobs. Each stage is actually simulated by updateMissions below.
  var JOBS = [
    {
      name: 'BEACH PACKAGE', reward: 750,
      brief: 'A towel, a package, and a very nervous contact. Keep it simple.',
      stages: [
        { type: 'goto', x: L.beach.x, y: L.beach.y, r: 95, text: 'Meet the contact on the west beach' },
        { type: 'interact', text: 'Pick up the seaside package [E]' },
        { type: 'goto', x: L.chopshop.x, y: L.chopshop.y, r: 105, text: 'Deliver the package to the chop shop' }
      ]
    },
    {
      name: 'MARINA HEIST', reward: 1400,
      brief: 'There is a crate on the marina with our name on it. The harbor patrol disagrees.',
      stages: [
        { type: 'drive', x: L.marina.x, y: L.marina.y, r: 115, text: 'Drive to the marina' },
        { type: 'wait', time: 2.6, text: 'Winch the cargo aboard' },
        { type: 'interact', text: 'Take the cargo [E]', police: 2 },
        { type: 'drive', x: L.chopshop.x, y: L.chopshop.y, r: 110, text: 'Move the cargo to the chop shop' }
      ]
    },
    {
      name: 'PALM COURT PICKUP', reward: 1900,
      brief: 'Palm Court is beautiful until the rival crew shows up. Bring an umbrella and a pistol.',
      stages: [
        { type: 'goto', x: L.park.x, y: L.park.y, r: 100, text: 'Reach Palm Court' },
        { type: 'shoot', count: 2, text: 'Take out the rival crew' },
        { type: 'interact', text: 'Collect the envelope [E]' },
        { type: 'drive', x: L.courthouse.x, y: L.courthouse.y, r: 110, text: 'Drop the envelope at the courthouse' }
      ]
    },
    {
      name: 'SUNSET RUN', reward: 2600,
      brief: 'One night, three streets, too many headlights. Do not brake on the boulevard.',
      stages: [
        { type: 'drive', x: L.sunset.x, y: L.sunset.y, r: 115, text: 'Burn down to Sunset Boulevard' },
        { type: 'wait', time: 3.2, text: 'Shake the tail', police: 2 },
        { type: 'drive', x: L.vault.x, y: L.vault.y, r: 110, text: 'Finish the run at the vault district' }
      ]
    },
    {
      name: 'DOCKSIDE SWEEP', reward: 3400,
      brief: 'The docks are crawling with guards. Clear the pier and take the shipment.',
      stages: [
        { type: 'drive', x: L.docks.x, y: L.docks.y, r: 115, text: 'Roll into the docks' },
        { type: 'shoot', count: 4, text: 'Clear the dock guards', police: 3 },
        { type: 'interact', text: 'Secure the shipment [E]' }
      ]
    },
    {
      name: 'HIGHWAY AMBUSH', reward: 4600,
      brief: 'They hit the convoy on the north highway. Get there before the cavalry does.',
      stages: [
        { type: 'drive', x: L.highway.x, y: L.highway.y, r: 120, text: 'Get to the north highway' },
        { type: 'wait', time: 4, text: 'Hold the ambush position' },
        { type: 'shoot', count: 3, text: 'Take out the ambush team', police: 4 },
        { type: 'escape', text: 'Lose the heat' }
      ]
    },
    {
      name: 'THE SOLARA SCORE', reward: 9000,
      brief: 'The vault. The gold. The boat. This is the one we have been working toward.',
      stages: [
        { type: 'goto', x: L.vault.x, y: L.vault.y, r: 105, text: 'Reach the vault district' },
        { type: 'interact', text: 'Crack the vault [E]', police: 4 },
        { type: 'wait', time: 3, text: 'Grab the gold and get out' },
        { type: 'drive', x: L.marina.x, y: L.marina.y, r: 120, text: 'Escape to the marina', police: 5 },
        { type: 'escape', text: 'Lose the cops before they find the boat' }
      ]
    }
  ];

  function resolve(world, x, y, onRoad) {
    var pt = onRoad ? CITY.nearestRoadPoint(world.city, x, y) : { x: x, y: y };
    return SB.World.clearSpot(world, pt.x, pt.y, 26);
  }

  function setupStage(world) {
    var m = world.mission, def = JOBS[m.index], st = def.stages[m.stage];
    st._x = st.x !== undefined ? resolve(world, st.x, st.y, st.type === 'drive').x : world.player.x;
    st._y = st.y !== undefined ? resolve(world, st.x, st.y, st.type === 'drive').y : world.player.y;
    if (st.type === 'interact' || st.type === 'wait') {
      st._x = world.player.x; st._y = world.player.y;
    }
    m.hits = 0;
    m.escapeTimer = 0;
    m.stageElapsed = 0;
    world.targets.length = 0;
    if (st.type === 'shoot') {
      for (var i = 0; i < (st.count || 2); i++) {
        var a = i / (st.count || 2) * U.TAU + 0.4;
        var d = U.range(world.rng, 75, 165);
        var spot = SB.World.clearSpot(world, st._x + Math.cos(a) * d, st._y + Math.sin(a) * d, 16);
        world.targets.push({ x: spot.x, y: spot.y, r: 15, hp: 32, alive: true, hitFlash: 0, seed: world.rng() });
      }
    }
    if (st.police) SB.Police.reportCrime(world, def.name + ' IN PROGRESS', st.police);
    SB.World.say(world, def.name, (m.stage === 0 ? def.brief + '  ' : '') + st.text, 6);
    SB.Audio.ui();
  }

  function start(world, index) {
    if (world.mission || index !== world.missionIndex || index >= JOBS.length) return false;
    index = U.clamp(index, 0, JOBS.length - 1);
    world.mission = {
      index: index, stage: 0, hits: 0, escapeTimer: 0,
      stageElapsed: 0, startedAt: world.elapsed, tips: 0
    };
    setupStage(world);
    SB.World.notify(world, 'JOB STARTED  •  ' + JOBS[index].name, '#ffd45e', 3.5);
    return true;
  }

  function advance(world) {
    var m = world.mission;
    world.targets.length = 0;
    m.stage++;
    if (m.stage >= JOBS[m.index].stages.length) {
      complete(world);
      return;
    }
    setupStage(world);
  }

  function complete(world) {
    var m = world.mission, def = JOBS[m.index];
    world.cash += def.reward;
    world.completed[m.index] = true;
    world.missionIndex = Math.min(JOBS.length, m.index + 1);
    world.stats.jobs++;
    world.mission = null;
    world.targets.length = 0;
    world.banner = { title: 'JOB COMPLETE', sub: def.name + '   +' + U.cash(def.reward), t: 0, life: 4.6 };
    SB.World.notify(world, 'Banked ' + U.cash(def.reward) + '. Next job is on the map.', '#9cf0c0', 5);
    SB.Audio.complete();
    SB.Save.write(world);
  }

  function fail(world, reason) {
    if (!world.mission) return;
    world.mission = null;
    world.targets.length = 0;
    world.banner = { title: 'JOB FAILED', sub: reason || 'Come back when you are ready.', t: 0, life: 3.6 };
    SB.Audio.fail();
  }

  function marker(world) {
    if (world.mission) {
      var def = JOBS[world.mission.index], st = def.stages[world.mission.stage];
      return { x: st._x, y: st._y, label: def.name, kind: st.type };
    }
    if (world.missionIndex < JOBS.length && world.player.alive) {
      var next = JOBS[world.missionIndex], first = next.stages[0];
      var pt = resolve(world, first.x, first.y, first.type === 'drive');
      return { x: pt.x, y: pt.y, label: next.name, kind: 'start' };
    }
    return null;
  }

  function update(world, dt) {
    if (world.state !== 'playing') return;
    var p = world.player, m = world.mission, I = SB.Input;
    if (!p.alive) { fail(world, 'You were taken to the hospital.'); return; }
    if (!m) {
      var mk = marker(world);
      if (!mk) return;
      var near = U.dist(p.x, p.y, mk.x, mk.y) < 115;
      world.missionPrompt = near ? 1 : 0;
      if (near && I.just('KeyF')) {
        start(world, world.missionIndex);
        I.consume('KeyF');
      }
      return;
    }
    world.missionPrompt = 0;
    var def = JOBS[m.index], st = def.stages[m.stage];
    m.stageElapsed += dt;
    var d = U.dist(p.x, p.y, st._x, st._y);
    var arrived = d < (st.r || 92);
    if (st.type === 'goto' && arrived) advance(world);
    else if (st.type === 'drive' && arrived && p.car && Math.abs(p.car.speed) > 35) advance(world);
    else if (st.type === 'drive' && arrived && p.car && Math.abs(p.car.speed) <= 35) {
      if (m.tips === 0) { SB.World.notify(world, 'Keep moving! The drop is a drive-by.', '#ffd45e', 2); m.tips = 1; }
    }
    else if (st.type === 'wait' && m.stageElapsed >= st.time) advance(world);
    else if (st.type === 'interact' && arrived && !p.car && I.just('KeyE')) {
      I.consume('KeyE'); advance(world);
    }
    else if (st.type === 'shoot' && m.hits >= (st.count || 2)) advance(world);
    else if (st.type === 'escape') {
      var closest = Infinity, i;
      for (i = 0; i < world.police.length; i++) {
        if (!world.police[i].wrecked) closest = Math.min(closest, U.dist(p.x, p.y, world.police[i].x, world.police[i].y));
      }
      if (world.wanted === 0 || (closest > 700 && m.stageElapsed > 2)) m.escapeTimer += dt;
      else m.escapeTimer = Math.max(0, m.escapeTimer - dt * 0.7);
      if (m.escapeTimer > 4) advance(world);
    }
  }

  function drawTargets(ctx, world) {
    for (var i = 0; i < world.targets.length; i++) {
      var t = world.targets[i];
      if (!t.alive) continue;
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.fillStyle = 'rgba(40,30,25,0.3)';
      ctx.beginPath(); ctx.ellipse(4, 7, 14, 7, 0, 0, U.TAU); ctx.fill();
      ctx.rotate(t.seed * 2);
      ctx.fillStyle = t.hitFlash > 0 ? '#fff2bf' : '#9b6540';
      U.roundRect(ctx, -13, -12, 26, 24, 3); ctx.fill();
      ctx.strokeStyle = '#6d442e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-13, -4); ctx.lineTo(13, -4); ctx.moveTo(0, -12); ctx.lineTo(0, 12); ctx.stroke();
      ctx.fillStyle = '#ffd45e'; ctx.fillRect(-4, -5, 8, 3);
      ctx.restore();
      t.hitFlash = Math.max(0, t.hitFlash - 0.016);
    }
  }

  function drawMarker(ctx, world) {
    var mk = marker(world);
    if (!mk) return;
    var pulse = 0.5 + 0.5 * Math.sin(world.elapsed * 3.2);
    ctx.save();
    ctx.translate(mk.x, mk.y);
    ctx.globalAlpha = 0.2 + pulse * 0.2;
    ctx.fillStyle = mk.kind === 'escape' ? '#7be8c3' : '#ffd45e';
    ctx.beginPath(); ctx.arc(0, 0, 42 + pulse * 12, 0, U.TAU); ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 28, 0, U.TAU); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -20); ctx.lineTo(15, 0); ctx.lineTo(0, 20); ctx.lineTo(-15, 0); ctx.closePath();
    ctx.fillStyle = mk.kind === 'escape' ? '#b6ffe5' : '#fff0b3'; ctx.fill();
    ctx.globalAlpha = 0.3;
    ctx.fillRect(-5, -160 - pulse * 12, 10, 145);
    ctx.restore();
  }

  SB.Missions = {
    JOBS: JOBS, start: start, update: update, marker: marker, fail: fail,
    drawMarker: drawMarker, drawTargets: drawTargets, setupStage: setupStage,
    advance: advance, complete: complete
  };
})(window.SB = window.SB || {});
