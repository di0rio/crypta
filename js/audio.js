(function (G) {
  'use strict';
  var A = G.audio = { ctx: null, master: null, muted: false, last: {}, nbuf: null };
  try { A.muted = localStorage.getItem('crypta.mute') === '1'; } catch (e) {}

  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      A.ctx = new AC();
      A.master = A.ctx.createGain();
      A.master.gain.value = A.muted ? 0 : 0.3;
      A.master.connect(A.ctx.destination);
    } catch (e) { A.ctx = null; }
  };
  A.setMuted = function (m) {
    A.muted = m;
    try { localStorage.setItem('crypta.mute', m ? '1' : '0'); } catch (e) {}
    if (A.master) A.master.gain.value = m ? 0 : 0.3;
  };
  function tone(type, f1, f2, dur, vol, delay) {
    var c = A.ctx, t = c.currentTime + (delay || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(A.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, cut) {
    var c = A.ctx;
    if (!A.nbuf) {
      A.nbuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      var d = A.nbuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    var s = c.createBufferSource(); s.buffer = A.nbuf;
    var f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut || 3000;
    var g = c.createGain(); g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    s.connect(f); f.connect(g); g.connect(A.master);
    s.start(); s.stop(c.currentTime + dur + 0.02);
  }
  var S = {
    shoot: function () { tone('square', 760, 260, 0.07, 0.10); },
    eshoot: function () { tone('triangle', 420, 200, 0.09, 0.10); },
    laser: function () { tone('sawtooth', 1200, 200, 0.14, 0.09); },
    swing: function () { noise(0.12, 0.18, 2500); tone('sine', 500, 200, 0.1, 0.08); },
    hit: function () { noise(0.05, 0.2, 2500); tone('square', 220, 90, 0.06, 0.08); },
    hurt: function () { tone('sawtooth', 240, 50, 0.22, 0.2); noise(0.1, 0.15, 1500); },
    pickup: function () { tone('sine', 520, 1040, 0.12, 0.18); },
    coin: function () { tone('square', 1100, 1500, 0.07, 0.08); },
    door: function () { tone('square', 140, 60, 0.3, 0.14); noise(0.25, 0.14, 700); },
    death: function () { noise(0.35, 0.28, 1800); tone('sawtooth', 200, 40, 0.3, 0.12); },
    boom: function () { noise(0.4, 0.34, 900); tone('sine', 120, 35, 0.35, 0.25); },
    dash: function () { noise(0.15, 0.12, 4000); },
    empty: function () { tone('square', 150, 120, 0.05, 0.06); },
    buy: function () { tone('square', 700, 700, 0.06, 0.09); tone('square', 1050, 1050, 0.09, 0.09, 0.07); },
    revive: function () { tone('sine', 400, 800, 0.2, 0.18); tone('sine', 600, 1200, 0.25, 0.14, 0.12); },
    ui: function () { tone('square', 500, 650, 0.05, 0.07); },
    portal: function () { tone('sine', 200, 900, 0.5, 0.2); }
  };
  A.play = function (n) {
    if (!A.ctx || A.muted || !S[n]) return;
    var now = performance.now();
    if (now - (A.last[n] || 0) < 30) return;
    A.last[n] = now;
    try { S[n](); } catch (e) {}
  };
})(window.G);
