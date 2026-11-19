/* SOLARA BAY - seven-job story chain with markers, briefs and rewards. */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const C = SB.C, U = SB.U;
  const P = function (ix, iy, ox, oy) {
    return { x: C.ROAD_X[ix] + (ox || 0), y: C.ROAD_Y[iy] + (oy || 0) };
  };
  function stage(label, at, opt) {
    opt = opt || {};
    return {
      label: label, x: at.x, y: at.y, r: opt.r || 78,
      action: opt.action || 'auto', hold: opt.hold || 0,
      car: !!opt.car, wanted: opt.wanted || 0,
      time: opt.time || 0, stay: opt.stay || 0,
      spawnCar: opt.spawnCar || null, message: opt.message || ''
    };
  }

  const JOBS = [
    {
      name: 'Beach Package', reward: 600,
      brief: 'A soaked duffel washed up on Sunset Strand. Grab it before the lifeguards do.',
      stages: [
        stage('Collect the beach package', P(0, 3, -125), { action: 'E', r: 92, message: 'The tide is coming in. Move.' }),
        stage('Deliver it to the beach stash', P(1, 5), { action: 'E', r: 82 })
      ]
    },
    {
      name: 'Marina Heist', reward: 1400,
      brief: 'The marina crate is unguarded for exactly one minute. Take the getaway car and lose the harbor patrol.',
      stages: [
        stage('Take the crate from Pier 2', { x: 480, y: 4700 }, { action: 'E', r: 58 }),
        stage('Get to the waiting getaway car', P(0, 14), { car: true, r: 70 }),
        stage('Lose the harbor patrol at the safehouse', P(3, 13), { car: true, wanted: 2, r: 92 })
      ]
    },
    {
      name: 'Palm Court Pickup', reward: 2100,
      brief: 'Three couriers are circling Palm Court. Sweep all three drops before they compare notes.',
      stages: [
        stage('Pick up parcel one', P(4, 5), { action: 'E' }),
        stage('Pick up parcel two', P(5, 6), { action: 'E' }),
        stage('Pick up parcel three', P(6, 7), { action: 'E' }),
        stage('Bring the parcels to Palm Court', P(7, 6), { action: 'E', r: 88 })
      ]
    },
    {
      name: 'Sunset Run', reward: 3000,
      brief: 'Four checkpoints, one golden hour. Stay in a car and beat the clock.',
      stages: [
        stage('Reach the start line', P(2, 10), { car: true }),
        stage('Checkpoint 1 of 4', P(6, 9), { car: true, time: 55 }),
        stage('Checkpoint 2 of 4', P(10, 6), { car: true, time: 55 }),
        stage('Checkpoint 3 of 4', P(13, 8), { car: true, time: 55 }),
        stage('Finish the Sunset Run', P(16, 11), { car: true, time: 60 })
      ]
    },
    {
      name: 'Dockside Sweep', reward: 4200,
      brief: 'Make noise at the docks, hold the block, then slip out before the cruisers box you in.',
      stages: [
        stage('Reach the dock gate', P(1, 14), { action: 'E', wanted: 3 }),
        stage('Hold the dockside block', P(1, 14), { stay: 30, r: 540, message: 'Hold your ground for 30 seconds.' }),
        stage('Escape through the south exit', P(2, 15), { r: 88 })
      ]
    },
    {
      name: 'Highway Ambush', reward: 6000,
      brief: 'They know the route. Run the gauntlet east and don\'t stop for the sirens.',
      stages: [
        stage('Drive into the ambush zone', P(8, 3), { car: true, wanted: 4 }),
        stage('Break through checkpoint 1', P(11, 3), { car: true, time: 65 }),
        stage('Break through checkpoint 2', P(13, 5), { car: true, time: 65 }),
        stage('Break through checkpoint 3', P(15, 7), { car: true, time: 65 })
      ]
    },
    {
      name: 'The Solara Score', reward: 15000,
      brief: 'One last job: crack the Solara vault and get to the far east gate before every cop in the bay catches up.',
      stages: [
        stage('Reach the Solara vault', P(12, 11), { action: 'E', r: 80 }),
        stage('Crack the vault (hold E)', P(12, 11), { action: 'E', hold: 3, r: 80 }),
        stage('Escape to the east gate with 5 stars', P(16, 16), { r: 110, time: 190, wanted: 5, message: 'Vault open. Every siren in the city just woke up.' })
      ]
    }
  ];

  const Missions = {
    jobs: JOBS,
    index: 0,
    active: null,
    failed: false,
    failReason: '',
    stageIndex: -1,
    stageTime: 0,
    holdTime: 0,
    totalTime: 0,

    start: function (i) {
      i = U.clamp(i, 0, JOBS.length - 1);
      this.index = i;
      this.failed = false;
      this.active = { job: i, step: 0 };
      this.stageIndex = -1;
      this.stageTime = 0; this.holdTime = 0; this.totalTime = 0;
      SB.Player.state.health = Math.max(55, SB.Player.state.health);
      if (SB.Screens && SB.Screens.banner) {
        SB.Screens.banner(JOBS[i].name, JOBS[i].brief, 5);
      }
      SB.Audio.blip(660, 0.18);
    },

    retry: function () {
      const i = this.active ? this.active.job : this.index;
      SB.Police.setWanted(0);
      SB.Player.state.health = 100;
      SB.Player.exitCar();
      const first = JOBS[i].stages[0];
      SB.Player.state.x = first.x + 70;
      SB.Player.state.y = first.y + 60;
      if (SB.World.solid(SB.Player.state.x, SB.Player.state.y, 16)) {
        SB.Player.state.x = first.x; SB.Player.state.y = first.y;
      }
      this.failed = false;
      this.start(i);
    },

    fail: function (reason) {
      this.active = null;
      this.failed = true;
      this.failReason = reason;
      if (SB.Screens && SB.Screens.banner) SB.Screens.banner('MISSION FAILED', reason + '  —  press R to retry', 4);
      SB.Audio.blip(140, 0.4);
    },

    complete: function () {
      const job = this.active.job;
      SB.Game.cash += JOBS[job].reward;
      this.index = Math.max(this.index, job + 1);
      this.active = null;
      SB.Police.setWanted(0);
      if (SB.Screens && SB.Screens.banner) {
        SB.Screens.banner('JOB COMPLETE', job + ' · ' + U.money(JOBS[job].reward), 5);
      }
      SB.Audio.blip(880, 0.25);
      if (SB.Save && SB.Save.write) SB.Save.write(SB.Game);
    },

    enterStage: function (st) {
      this.stageTime = 0; this.holdTime = 0;
      if (st.wanted) SB.Police.setWanted(st.wanted);
      if (st.spawnCar) {
        const c = SB.Vehicles.spawn(st.spawnCar.x, st.spawnCar.y, st.spawnCar.a || 0,
          { kind: 'civilian', color: '#f0c85e', maxSpeed: 300 });
        c.controls.throttle = 0;
      }
      if (st.message && SB.Screens && SB.Screens.toast) SB.Screens.toast(st.message);
    },

    update: function (dt, input) {
      if (!this.active) {
        if (this.failed && input.pressed('KeyR')) this.retry();
        return;
      }
      if (SB.Player.state.health <= 0) { this.fail('You went down'); return; }
      const job = JOBS[this.active.job];
      const st = job.stages[this.active.step];
      if (this.stageIndex !== this.active.step) {
        this.stageIndex = this.active.step;
        this.enterStage(st);
      }
      this.stageTime += dt;
      this.totalTime += dt;
      if (st.time && this.stageTime > st.time) { this.fail('Out of time'); return; }

      const p = SB.Player.state;
      const inside = U.dist(p.x, p.y, st.x, st.y) < st.r;
      if (st.stay) {
        if (inside) this.holdTime += dt; else this.holdTime = Math.max(0, this.holdTime - dt * 0.5);
        if (this.holdTime >= st.stay) this.advance();
        return;
      }
      let ok = inside && (!st.car || !!p.inCar);
      if (st.hold) {
        // Holding E fills a progress bar; it does not need an edge-trigger.
        if (!input.down('KeyE')) ok = false;
        if (ok) {
          this.holdTime += dt;
          if (this.holdTime < st.hold) ok = false;
        }
      } else {
        this.holdTime = 0;
        if (ok && st.action === 'E' && !input.pressed('KeyE')) ok = false;
      }
      if (ok) this.advance();
    },

    advance: function () {
      this.active.step++;
      this.holdTime = 0; this.stageTime = 0;
      if (this.active.step >= JOBS[this.active.job].stages.length) this.complete();
      else SB.Audio.blip(720, 0.1);
    },

    objective: function () {
      if (!this.active) return null;
      const job = JOBS[this.active.job];
      const st = job.stages[this.active.step];
      return {
        x: st.x, y: st.y, r: st.r, label: st.label,
        job: job.name, reward: job.reward,
        timeLeft: st.time ? Math.max(0, st.time - this.stageTime) : 0,
        hold: st.hold ? U.clamp(this.holdTime / st.hold, 0, 1) : 0,
        stay: st.stay ? U.clamp(this.holdTime / st.stay, 0, 1) : 0
      };
    },

    drawMarker: function (ctx, time) {
      const o = this.objective();
      if (!o) return;
      const pulse = 0.5 + 0.5 * Math.sin(time * 4);
      ctx.save();
      ctx.globalAlpha = 0.22 + pulse * 0.25;
      ctx.fillStyle = '#ffd45c';
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r * (0.7 + pulse * 0.12), 0, U.TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#fff3c4'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(o.x, o.y, 22 + pulse * 7, 0, U.TAU); ctx.stroke();
      ctx.fillStyle = '#ffcf4d';
      ctx.beginPath();
      ctx.moveTo(o.x, o.y - 15); ctx.lineTo(o.x + 15, o.y); ctx.lineTo(o.x, o.y + 15); ctx.lineTo(o.x - 15, o.y);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,210,90,0.65)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(o.x, o.y - 15); ctx.lineTo(o.x, o.y - 92 - pulse * 12); ctx.stroke();
      ctx.font = 'bold 15px Arial'; ctx.textAlign = 'center';
      ctx.fillStyle = '#3a2a1d';
      const w = ctx.measureText(o.label).width + 18;
      ctx.fillRect(o.x - w / 2, o.y - 124, w, 24);
      ctx.fillStyle = '#fff3c4';
      ctx.fillText(o.label, o.x, o.y - 107);
      ctx.restore();
    }
  };

  SB.Missions = Missions;
})();
