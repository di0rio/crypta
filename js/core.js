window.G = window.G || {};
(function (G) {
  'use strict';
  G.W = 400; G.H = 225; G.TILE = 16;
  G.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  G.lerp = function (a, b, t) { return a + (b - a) * t; };
  G.rand = function (a, b) { return a + Math.random() * (b - a); };
  G.randi = function (a, b) { return a + Math.floor(Math.random() * (b - a + 1)); };
  G.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  G.angDiff = function (a, b) {
    var d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };
  // seeded RNG (mulberry32)
  G.rng = function (seed) {
    var s = seed >>> 0;
    var o = {
      next: function () {
        s = (s + 0x6D2B79F5) >>> 0;
        var t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
      int: function (a, b) { return a + Math.floor(o.next() * (b - a + 1)); },
      range: function (a, b) { return a + o.next() * (b - a); },
      pick: function (arr) { return arr[Math.floor(o.next() * arr.length)]; },
      chance: function (p) { return o.next() < p; },
      shuffle: function (arr) {
        for (var i = arr.length - 1; i > 0; i--) {
          var j = Math.floor(o.next() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
      }
    };
    return o;
  };
  G.hashStr = function (str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  G.roomCode = function () {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '';
    for (var i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  };

  // interpolation buffer for remote entities
  G.Interp = function () { this.b = []; this.o = { x: 0, y: 0 }; };
  G.Interp.prototype.push = function (t, x, y) {
    var b = this.b; b.push({ t: t, x: x, y: y }); if (b.length > 6) b.shift();
  };
  G.Interp.prototype.reset = function () { this.b.length = 0; };
  G.Interp.prototype.get = function (rt) {
    var b = this.b, o = this.o;
    if (!b.length) return null;
    if (rt <= b[0].t) { o.x = b[0].x; o.y = b[0].y; return o; }
    for (var i = 1; i < b.length; i++) {
      if (rt <= b[i].t) {
        var a = b[i - 1], c = b[i], k = (rt - a.t) / Math.max(1, c.t - a.t);
        o.x = a.x + (c.x - a.x) * k; o.y = a.y + (c.y - a.y) * k; return o;
      }
    }
    var l = b[b.length - 1]; o.x = l.x; o.y = l.y; return o;
  };

  // mode registry
  G.modes = {
    list: [], reg: {},
    register: function (def) { if (!this.reg[def.id]) this.list.push(def); this.reg[def.id] = def; },
    get: function (id) { return this.reg[id]; }
  };

  G.session = { role: 'solo', local: 0, players: {}, rseq: 0, code: null };
  G.debug = {};
})(window.G);
