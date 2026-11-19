// WebAudio only: engine, siren, gunshots, explosions, pickups and a low surf hum. No audio files,
// no network, and nothing starts until the first key or click (browser autoplay rules).
(function (SB) {
  'use strict';
  const u = SB.u, VOL = SB.AUDIO.masterVolume;

  SB.audio = {
    create: function () {
      return {
        ctx: null, master: null, engine: null, engineGain: null, engineFilter: null,
        siren: null, sirenGain: null, noise: null, enabled: true, started: false
      };
    },

    init: function (audio) {
      if (audio.started) return;
      audio.started = true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        const ctx = audio.ctx = new AC();
        const master = audio.master = ctx.createGain();
        master.gain.value = audio.enabled ? VOL : 0;
        master.connect(ctx.destination);

        const filter = audio.engineFilter = ctx.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.value = 680; // a little more engine growl under acceleration
        const eg = audio.engineGain = ctx.createGain(); eg.gain.value = 0;
        const engine = audio.engine = ctx.createOscillator();
        engine.type = 'sawtooth'; engine.frequency.value = 60;
        engine.connect(filter); filter.connect(eg); eg.connect(master); engine.start();

        const sg = audio.sirenGain = ctx.createGain(); sg.gain.value = 0;
        const siren = audio.siren = ctx.createOscillator();
        siren.type = 'square'; siren.frequency.value = 700;
        siren.connect(sg); sg.connect(master); siren.start();

        const len = Math.floor(ctx.sampleRate * 1.2);
        const noise = audio.noise = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
        const surf = ctx.createBufferSource(); surf.buffer = noise; surf.loop = true;
        const surfFilter = ctx.createBiquadFilter(); surfFilter.type = 'lowpass'; surfFilter.frequency.value = 420;
        const surfGain = ctx.createGain(); surfGain.gain.value = 0.026;
        surf.connect(surfFilter); surfFilter.connect(surfGain); surfGain.connect(master); surf.start();
      } catch (err) {
        audio.ctx = null;
      }
    },

    resume: function (audio) {
      if (audio.ctx && audio.ctx.state === 'suspended') {
        const pending = audio.ctx.resume();
        if (pending && typeof pending.catch === 'function') pending.catch(function () {});
      }
    },

    toggle: function (audio) {
      audio.enabled = !audio.enabled;
      if (audio.master) audio.master.gain.value = audio.enabled ? VOL : 0;
      return audio.enabled;
    },

    update: function (audio, w) {
      if (!audio.ctx) return;
      const now = audio.ctx.currentTime;
      const car = w.player.inCar;
      const speed = car ? Math.hypot(car.vx, car.vy) / SB.CAR.maxSpeed : 0;
      const eg = audio.engineGain.gain, ef = audio.engine.frequency;
      eg.setTargetAtTime(car ? 0.055 + speed * 0.11 : 0.008, now, 0.09);
      ef.setTargetAtTime(52 + speed * 150 + (car && car.throttle > 0 ? 18 : 0), now, 0.07);
      const px = w.player.inCar ? w.player.inCar.x : w.player.x;
      const py = w.player.inCar ? w.player.inCar.y : w.player.y;
      let close = false;
      for (const c of w.cops) if (u.dist(c.x, c.y, px, py) < 720) { close = true; break; }
      const active = w.wanted > 0;
      audio.sirenGain.gain.setTargetAtTime(active ? (close ? 0.042 : 0.014) : 0, now, 0.2);
      // Wail from the AudioContext clock so it keeps howling on the BUSTED screen.
      audio.siren.frequency.setTargetAtTime(560 + Math.abs(Math.sin(now * 3.2)) * 380, now, 0.05);
    },

    play: function (audio, name) {
      if (!audio || !audio.ctx || !audio.enabled) return;
      SB.audio.resume(audio);
      const ctx = audio.ctx, now = ctx.currentTime;
      if (name === 'gun' || name === 'punch' || name === 'explosion') {
        const src = ctx.createBufferSource(); src.buffer = audio.noise;
        src.playbackRate.value = name === 'explosion' ? 0.55 : name === 'punch' ? 0.8 : 1.4;
        const filter = ctx.createBiquadFilter();
        filter.type = name === 'explosion' ? 'lowpass' : 'bandpass';
        filter.frequency.value = name === 'explosion' ? 420 : name === 'punch' ? 350 : 1800; // crisper gunfire crack
        const gain = ctx.createGain();
        const peak = name === 'explosion' ? 0.42 : name === 'punch' ? 0.18 : 0.22;
        const dur = name === 'explosion' ? 0.7 : name === 'punch' ? 0.12 : 0.14;
        gain.gain.setValueAtTime(peak, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        src.connect(filter); filter.connect(gain); gain.connect(audio.master);
        src.start(now); src.stop(now + dur + 0.02);
      } else if (name === 'mission') {
        // A short rising two-note sting when a job starts or the chain closes.
        for (let k = 0; k < 2; k += 1) {
          const osc = ctx.createOscillator(), gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(k ? 660 : 440, now + k * 0.14);
          gain.gain.setValueAtTime(0.001, now + k * 0.14);
          gain.gain.linearRampToValueAtTime(0.13, now + k * 0.14 + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, now + k * 0.14 + 0.34);
          osc.connect(gain); gain.connect(audio.master);
          osc.start(now + k * 0.14); osc.stop(now + k * 0.14 + 0.36);
        }
      } else if (name === 'siren') {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(700, now);
        osc.frequency.linearRampToValueAtTime(420, now + 0.35);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.connect(gain); gain.connect(audio.master);
        osc.start(now); osc.stop(now + 0.47);
      } else {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = name === 'pickup' ? 'sine' : 'triangle';
        const base = name === 'pickup' ? 720 : name === 'busted' ? 220 : 420;
        osc.frequency.setValueAtTime(base, now);
        osc.frequency.exponentialRampToValueAtTime(name === 'pickup' ? 1200 : base * 0.5, now + 0.22);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain); gain.connect(audio.master);
        osc.start(now); osc.stop(now + 0.32);
      }
    }
  };
})(window.SB = window.SB || {});
