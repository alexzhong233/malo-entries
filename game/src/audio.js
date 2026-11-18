// Tiny WebAudio synth. No external assets. In shot mode the caller should not create/use it.

export function createAudio() {
  let ctx = null;
  let enabled = true;

  function ensure() {
    if (!enabled) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function tone({ freq = 440, type = 'sine', dur = 0.1, gain = 0.04, slide = 0, when = 0 }) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + when;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise({ dur = 0.12, gain = 0.03, freq = 900, q = 1 }) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime;
    const buffer = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(c.destination);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  return {
    setEnabled(value) { enabled = !!value; },
    unlock() { ensure(); },
    collect() {
      tone({ freq: 520, type: 'triangle', dur: 0.08, gain: 0.03, slide: 220 });
      tone({ freq: 880, type: 'sine', dur: 0.06, gain: 0.015, slide: 180, when: 0.02 });
    },
    phase() {
      tone({ freq: 330, type: 'sine', dur: 0.18, gain: 0.04, slide: 220 });
      tone({ freq: 495, type: 'triangle', dur: 0.22, gain: 0.03, slide: 300, when: 0.06 });
      tone({ freq: 660, type: 'sine', dur: 0.26, gain: 0.025, slide: 260, when: 0.12 });
    },
    hit() {
      tone({ freq: 180, type: 'sawtooth', dur: 0.18, gain: 0.05, slide: -90 });
      noise({ dur: 0.16, gain: 0.04, freq: 320, q: 0.7 });
    },
    win() {
      [440, 554, 659, 880].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.28, gain: 0.03, slide: 40, when: i * 0.08 }));
    },
    over() {
      tone({ freq: 220, type: 'sawtooth', dur: 0.35, gain: 0.04, slide: -120 });
      tone({ freq: 165, type: 'triangle', dur: 0.45, gain: 0.03, slide: -80, when: 0.08 });
    },
    pulse(attracting) {
      tone({ freq: attracting ? 700 : 260, type: 'sine', dur: 0.05, gain: 0.012, slide: attracting ? 80 : -60 });
    },
  };
}
