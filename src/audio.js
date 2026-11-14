// Procedural sound (WebAudio, no files): wind bed, night crickets, footsteps by surface, jump/land/roll, ember chimes.
// Created on the first user gesture; every call is a no-op until then.

export function createAudio() {
  let ctx = null, master, windGain, windFilter, cricketGain, noiseBuf, cricketT = 0, muted = false;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = last * 0.6 + w * 0.4; d[i] = last; }   // soft noise
    // wind: looped noise through a slowly moving band-pass
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 420; windFilter.Q.value = 0.5;
    windGain = ctx.createGain(); windGain.gain.value = 0;
    src.connect(windFilter); windFilter.connect(windGain); windGain.connect(master); src.start();
    cricketGain = ctx.createGain(); cricketGain.gain.value = 0; cricketGain.connect(master);
  }

  function noise(dur, type, f0, f1, vol, q) {
    if (!ctx) return;
    const t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.5;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q || 0.8;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 1.5, dur + 0.05);
  }
  function tone(freq, dur, vol, type, delay, glide) {
    if (!ctx) return;
    const t = ctx.currentTime + (delay || 0), o = ctx.createOscillator(); o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t); if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }

  const SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.5];   // C major pentatonic-ish
  return {
    init,
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.7; return muted; },
    update(dt, speed, night, time) {
      if (!ctx) return;
      const t = ctx.currentTime, gust = 0.5 + 0.5 * Math.sin(time * 0.23) * Math.sin(time * 0.071 + 1.3);
      windGain.gain.setTargetAtTime(0.05 + gust * 0.07 + Math.min(speed, 12) * 0.008, t, 0.4);
      windFilter.frequency.setTargetAtTime(320 + gust * 320 + speed * 35, t, 0.5);
      // crickets: short trills, only at night
      cricketT -= dt;
      if (night > 0.25 && cricketT <= 0) {
        cricketT = 0.35 + Math.random() * 1.1;
        const f = 3900 + Math.random() * 900, n = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) tone(f, 0.05, 0.012 * night, 'sine', i * 0.07);
      }
    },
    step(surface, sprint) {
      const v = sprint ? 1.25 : 1;
      if (surface === 'water') noise(0.22, 'highpass', 900, 2600, 0.11 * v, 0.6);
      else if (surface === 'dirt') { noise(0.11, 'lowpass', 700, 220, 0.16 * v); tone(95, 0.07, 0.07 * v, 'sine', 0, 60); }
      else noise(0.13, 'bandpass', 1500 + Math.random() * 500, 800, 0.085 * v, 0.9);   // grass swish
    },
    swim() { noise(0.4, 'bandpass', 500, 1400, 0.09, 0.7); },
    jump() { noise(0.2, 'bandpass', 500, 1500, 0.07, 1.2); },
    land() { tone(110, 0.14, 0.2, 'sine', 0, 55); noise(0.16, 'lowpass', 900, 200, 0.16); },
    bump() { tone(150, 0.12, 0.16, 'triangle', 0, 70); noise(0.5, 'bandpass', 2400, 1200, 0.07, 0.7); },
    rustle() { noise(0.26, 'bandpass', 2600 + Math.random() * 800, 1500, 0.1, 0.8); },
    lamp() { tone(1318.5, 0.5, 0.045, 'sine'); tone(1975.5, 0.35, 0.02, 'sine', 0.04); },
    roll() { noise(0.42, 'bandpass', 350, 1300, 0.12, 1.0); },
    ember(n, all) {
      const base = SCALE[n % SCALE.length];
      [1, 1.5, 2].forEach((m, i) => tone(base * m, 1.4 - i * 0.2, 0.09 / (i + 1), 'sine', i * 0.09));
      tone(base * 3, 0.5, 0.03, 'triangle', 0.22);
      if (all) [0, 2, 4, 5, 7].forEach((k, i) => tone(SCALE[k], 2.2, 0.08, 'sine', 0.5 + i * 0.16));
    }
  };
}
