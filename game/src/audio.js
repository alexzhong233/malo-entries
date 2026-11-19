(function (SB) {
  'use strict';

  var ctx = null, master = null, noise = null;
  var engine = null, engineGain = null, engineFilter = null;
  var siren = null, sirenGain = null, sirenLfo = null;
  var waveGain = null, waveFilter = null, waveSrc = null;
  var enabled = true, started = false, muted = false;

  function makeNoise() {
    var buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function init() {
    if (started || !enabled) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { enabled = false; return; }
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.34;
      master.connect(ctx.destination);
      noise = makeNoise();

      engine = ctx.createOscillator();
      engine.type = 'sawtooth';
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engine.connect(engineFilter); engineFilter.connect(engineGain); engineGain.connect(master);
      engine.start();

      siren = ctx.createOscillator();
      siren.type = 'square';
      siren.frequency.value = 680;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      var lfo = ctx.createOscillator();
      lfo.frequency.value = 0.8;
      sirenLfo = ctx.createGain();
      sirenLfo.gain.value = 190;
      lfo.connect(sirenLfo); sirenLfo.connect(siren.frequency);
      siren.connect(sirenGain); sirenGain.connect(master);
      siren.start(); lfo.start();

      waveSrc = ctx.createBufferSource();
      waveSrc.buffer = noise; waveSrc.loop = true;
      waveFilter = ctx.createBiquadFilter();
      waveFilter.type = 'lowpass'; waveFilter.frequency.value = 480;
      waveGain = ctx.createGain(); waveGain.gain.value = 0.035;
      waveSrc.connect(waveFilter); waveFilter.connect(waveGain); waveGain.connect(master);
      waveSrc.start();
      started = true;
    } catch (e) { enabled = false; ctx = null; }
  }

  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume().catch(function () {}); }

  function burst(duration, freq, q, volume, type) {
    if (!started || !ctx || muted) return;
    try {
      var src = ctx.createBufferSource(); src.buffer = noise;
      var filter = ctx.createBiquadFilter();
      filter.type = type || 'bandpass'; filter.frequency.value = freq; filter.Q.value = q || 1;
      var gain = ctx.createGain();
      var t = ctx.currentTime;
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      src.connect(filter); filter.connect(gain); gain.connect(master);
      src.start(t); src.stop(t + duration + 0.02);
    } catch (e) {}
  }

  function tone(freq, end, duration, volume, type) {
    if (!started || !ctx || muted) return;
    try {
      var o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(30, end), t + duration);
      g.gain.setValueAtTime(volume, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + duration);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + duration + 0.02);
    } catch (e) {}
  }

  function shot() { burst(0.13, 1500, 0.9, 0.55, 'bandpass'); tone(180, 60, 0.1, 0.2, 'square'); }
  function explosion() {
    burst(0.9, 130, 0.5, 0.95, 'lowpass');
    tone(90, 28, 0.85, 0.6, 'sawtooth');
    burst(0.32, 900, 0.7, 0.35, 'bandpass');
  }
  function ui() { tone(620, 880, 0.09, 0.16, 'triangle'); }
  function fail() { tone(280, 90, 0.42, 0.24, 'sawtooth'); }
  function complete() {
    [523, 659, 784, 1046].forEach(function (f, i) {
      setTimeout(function () { tone(f, f * 1.01, 0.22, 0.18, 'triangle'); }, i * 105);
    });
  }
  function hit() { burst(0.1, 320, 0.8, 0.28, 'bandpass'); }
  function skid() { burst(0.18, 2400, 2.2, 0.11, 'bandpass'); }

  function update(world) {
    if (!started || !ctx || muted) return;
    var p = world.player, car = p.car;
    var speed = car ? Math.abs(car.speed) : 0;
    var rev = world.elapsed * 12 + speed * 0.28;
    try {
      engine.frequency.setTargetAtTime(48 + (speed * 0.62) + (car && car.wrecked ? 0 : 0), ctx.currentTime, 0.08);
      engineFilter.frequency.setTargetAtTime(240 + speed * 3.1, ctx.currentTime, 0.1);
      engineGain.gain.setTargetAtTime(car ? 0.09 + Math.min(0.14, speed / 2600) : 0, ctx.currentTime, 0.15);
      sirenGain.gain.setTargetAtTime(world.wanted > 0 ? 0.055 + world.wanted * 0.008 : 0, ctx.currentTime, 0.35);
      sirenLfo.gain.setTargetAtTime(110 + world.wanted * 40, ctx.currentTime, 0.4);
      var shore = Math.abs(p.x - SB.City.shorelineAt(p.y));
      var waves = Uclamp(1 - shore / 900) * (0.045 + 0.018 * Math.sin(rev * 0.08));
      waveGain.gain.setTargetAtTime(waves, ctx.currentTime, 0.7);
      waveFilter.frequency.setTargetAtTime(380 + 170 * Math.sin(rev * 0.05), ctx.currentTime, 0.8);
    } catch (e) {}
  }

  function Uclamp(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  function toggleMute() {
    muted = !muted;
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.34, ctx.currentTime, 0.05);
    return muted;
  }

  SB.Audio = {
    init: init, resume: resume, update: update, shot: shot, explosion: explosion,
    ui: ui, fail: fail, complete: complete, hit: hit, skid: skid,
    toggleMute: toggleMute, isMuted: function () { return muted; },
    isReady: function () { return started; }
  };
})(window.SB = window.SB || {});
