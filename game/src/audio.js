/* SOLARA BAY - all sound is synthesised with WebAudio; no audio files. */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const U = SB.U;

  const Audio = {
    ctx: null,
    master: null,
    engine: null,
    engineGain: null,
    siren: null,
    sirenGain: null,
    waves: null,
    waveGain: null,
    noise: null,
    muted: false,

    init: function () {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(function () {});
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        const ctx = new AC();
        this.ctx = ctx;
        const master = ctx.createGain();
        master.gain.value = 0.32;
        master.connect(ctx.destination);
        this.master = master;

        // Reusable two-second noise buffer for waves, shots and explosions.
        const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        this.noise = buf;

        const engine = ctx.createOscillator();
        engine.type = 'sawtooth';
        engine.frequency.value = 62;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.value = 420;
        const eg = ctx.createGain(); eg.gain.value = 0;
        engine.connect(filter); filter.connect(eg); eg.connect(master);
        engine.start();
        this.engine = engine; this.engineGain = eg; this.engineFilter = filter;

        const siren = ctx.createOscillator();
        siren.type = 'square'; siren.frequency.value = 620;
        const sg = ctx.createGain(); sg.gain.value = 0;
        siren.connect(sg); sg.connect(master); siren.start();
        this.siren = siren; this.sirenGain = sg;

        const wsrc = ctx.createBufferSource();
        wsrc.buffer = buf; wsrc.loop = true;
        const wf = ctx.createBiquadFilter();
        wf.type = 'lowpass'; wf.frequency.value = 720;
        const wg = ctx.createGain(); wg.gain.value = 0;
        wsrc.connect(wf); wf.connect(wg); wg.connect(master); wsrc.start();
        this.waves = wsrc; this.waveGain = wg;
      } catch (e) { this.ctx = null; }
    },

    setEngine: function (speed, on) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const s = Math.abs(speed);
      this.engine.frequency.setTargetAtTime(58 + s * 0.48, t, 0.08);
      this.engineFilter.frequency.setTargetAtTime(340 + s * 2.4, t, 0.1);
      this.engineGain.gain.setTargetAtTime(on && !this.muted ? 0.055 + Math.min(0.1, s / 2800) : 0, t, 0.12);
    },

    setSiren: function (wanted, on) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      if (on && wanted > 0 && !this.muted) {
        this.siren.frequency.setTargetAtTime(540 + (wanted % 3) * 110 + Math.sin(t * 5.5) * 130, t, 0.03);
        this.sirenGain.gain.setTargetAtTime(0.035 + wanted * 0.006, t, 0.15);
      } else this.sirenGain.gain.setTargetAtTime(0, t, 0.2);
    },

    setWaves: function (distanceToShore) {
      if (!this.ctx) return;
      const v = this.muted ? 0 : U.clamp(1 - distanceToShore / 950, 0, 1) * 0.075;
      this.waveGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.5);
    },

    shot: function (power) {
      if (!this.ctx || this.muted) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const src = ctx.createBufferSource(); src.buffer = this.noise;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 0.6;
      const g = ctx.createGain();
      g.gain.setValueAtTime((power || 1) * 0.32, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + 0.15);
    },

    boom: function () {
      if (!this.ctx || this.muted) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const src = ctx.createBufferSource(); src.buffer = this.noise;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t);
      f.frequency.exponentialRampToValueAtTime(80, t + 0.8);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.75, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + 0.95);
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(35, t + 0.65);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.5, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.72);
    },

    blip: function (freq, dur) {
      if (!this.ctx || this.muted) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq || 520;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + (dur || 0.12));
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + (dur || 0.12) + 0.01);
    },

    toggle: function () {
      this.muted = !this.muted;
      if (this.master) this.master.gain.value = this.muted ? 0 : 0.32;
      return this.muted;
    }
  };

  SB.Audio = Audio;
})();
