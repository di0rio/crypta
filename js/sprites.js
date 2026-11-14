(function (G) {
  'use strict';
  var S = G.sprites = {};
  var OUT = '#1a1020';

  function mk(w, h) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    return [c, x];
  }
  S.mk = mk;
  function hex(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function shade(h, amt) {
    var c = hex(h);
    return '#' + c.map(function (v) { v = G.clamp(v + amt, 0, 255); return (v < 16 ? '0' : '') + v.toString(16); }).join('');
  }
  S.shade = shade;

  // add 1px outline around opaque pixels
  function outline(c, x, col) {
    var w = c.width, h = c.height, id = x.getImageData(0, 0, w, h), d = id.data, rgb = hex(col), mark = [];
    for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) {
      var i = (yy * w + xx) * 4;
      if (d[i + 3] !== 0) continue;
      if ((xx > 0 && d[i - 4 + 3] > 0) || (xx < w - 1 && d[i + 4 + 3] > 0) ||
          (yy > 0 && d[i - w * 4 + 3] > 0) || (yy < h - 1 && d[i + w * 4 + 3] > 0)) mark.push(i);
    }
    for (var k = 0; k < mark.length; k++) {
      var j = mark[k]; d[j] = rgb[0]; d[j + 1] = rgb[1]; d[j + 2] = rgb[2]; d[j + 3] = 255;
    }
    x.putImageData(id, 0, 0);
    return c;
  }

  // palette-string matrix -> canvas (pad = transparent margin for outline)
  function fromMatrix(rows, pal, mirror, pad) {
    pad = pad || 0;
    var rw = rows[0].length * (mirror ? 2 : 1), rh = rows.length;
    var a = mk(rw + pad * 2, rh + pad * 2), c = a[0], x = a[1];
    for (var yy = 0; yy < rh; yy++) {
      var s = rows[yy];
      if (mirror) s = s + s.split('').reverse().join('');
      for (var xx = 0; xx < s.length; xx++) {
        var ch = s[xx];
        if (ch === '.' || !pal[ch]) continue;
        x.fillStyle = pal[ch]; x.fillRect(xx + pad, yy + pad, 1, 1);
      }
    }
    return c;
  }
  S.fromMatrix = fromMatrix;

  var flashCache = new WeakMap();
  S.flash = function (c) {
    var f = flashCache.get(c);
    if (!f) {
      var a = mk(c.width, c.height); a[1].drawImage(c, 0, 0);
      a[1].globalCompositeOperation = 'source-atop'; a[1].fillStyle = '#fff'; a[1].fillRect(0, 0, c.width, c.height);
      f = a[0]; flashCache.set(c, f);
    }
    return f;
  };
  var greyCache = new WeakMap();
  S.grey = function (c) {
    var f = greyCache.get(c);
    if (!f) {
      var a = mk(c.width, c.height); a[1].drawImage(c, 0, 0);
      a[1].globalCompositeOperation = 'source-atop'; a[1].fillStyle = 'rgba(40,40,60,0.7)'; a[1].fillRect(0, 0, c.width, c.height);
      f = a[0]; greyCache.set(c, f);
    }
    return f;
  };

  // pixel shadow (ellipse made of rects)
  S.shadow = function (ctx, x, y, rx) {
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    var w = Math.round(rx * 2);
    ctx.fillRect(Math.round(x - rx + 2), Math.round(y - 1), w - 4, 1);
    ctx.fillRect(Math.round(x - rx), Math.round(y), w, 2);
    ctx.fillRect(Math.round(x - rx + 2), Math.round(y + 2), w - 4, 1);
  };

  // ---------- CHARACTER ----------
  var charCache = {};
  S.charKey = function (c) { return [c.body, c.skin, c.outfit, c.accent, c.head, c.eyes, c.back].join('-'); };

  function drawChar(cfg, walk, fi) {
    var P = G.data.palettes, a = mk(24, 28), c = a[0], x = a[1];
    function R(px, py, w, h, col) { x.fillStyle = col; x.fillRect(px, py + 4, w, h); }
    function RX(px, py, w, h, col) { R(px, py, w, h, col); R(24 - px - w, py, w, h, col); }
    var skin = P.skin[cfg.skin], out = P.outfit[cfg.outfit], acc = P.accent[cfg.accent];
    var skinD = shade(skin, -45), skinL = shade(skin, 35), outD = shade(out, -45), outL = shade(out, 30), accD = shade(acc, -50);
    var ink = '#1a1020', body = cfg.body;
    var by = walk ? [0, -1, 0, -1][fi] : (fi ? 1 : 0);
    var x0 = 7, y0 = 4 + by;

    // back accessory
    if (cfg.back === 1) {
      var sw = walk ? [0, 1, 0, -1][fi] : 0;
      R(8, 13 + by, 8, 7, accD); R(8 + sw, 19 + by, 8, 1, accD); R(8, 13 + by, 8, 1, acc);
    } else if (cfg.back === 2) {
      R(15, 13 + by, 4, 6, accD); R(15, 13 + by, 4, 1, acc); R(17, 15 + by, 1, 2, '#ffd84a');
    } else if (cfg.back === 3) {
      var wing = shade(acc, 20), fl = walk ? (fi % 2) : fi;
      RX(3, 8 + by - fl, 4, 2, wing); RX(2, 10 + by - fl, 5, 3, wing); RX(3, 13 + by - fl, 5, 2, accD); RX(4, 15 + by - fl, 3, 1, accD);
    }
    if (body === 2) { // cat tail
      R(15, 15 + by, 3, 1, skin); R(17, 12 + by, 1, 4, skin); R(17, 11 + by, 1, 1, skinD);
    }
    // legs
    var l1 = (walk && fi === 1) ? 1 : 0, l2 = (walk && fi === 3) ? 1 : 0;
    var legC = body === 3 ? skin : outD;
    R(9, 18, 2, 3 - l1, legC); R(13, 18, 2, 3 - l2, legC);
    R(9, 20 - l1, 2, 1, ink); R(13, 20 - l2, 2, 1, ink);
    // body
    R(9, 13 + by, 6, 5, out); R(9, 13 + by, 6, 1, outL); R(14, 14 + by, 1, 4, outD); R(9, 16 + by, 6, 1, acc);
    if (body === 3) { R(10, 14 + by, 4, 1, '#e8e8f0'); R(11, 15 + by, 2, 1, '#e8e8f0'); }
    if (body === 1) { R(11, 14 + by, 2, 2, acc); }
    // arms
    RX(7, 13 + by, 2, 4, out); RX(7, 16 + by, 2, 1, skin);

    // head
    if (body === 1) {
      R(x0, y0, 10, 9, skin); R(x0, y0, 10, 1, skinL); R(x0, y0 + 8, 10, 1, skinD);
      R(x0 + 1, y0 + 3, 8, 4, '#12202e');
      R(11, y0 - 2, 2, 2, skinD); R(11, y0 - 3, 2, 1, '#ff4a5a'); RX(x0 - 1, y0 + 3, 1, 3, skinD);
    } else {
      R(x0 + 1, y0, 8, 1, skin); R(x0, y0 + 1, 10, 7, skin); R(x0 + 1, y0 + 8, 8, 1, skinD);
      R(x0 + 1, y0 + 1, 2, 1, skinL);
      if (body === 0) { RX(x0 - 1, y0 + 4, 1, 2, skin); R(x0 + 1, y0 + 6, 1, 1, '#ff9a9a'); R(x0 + 8, y0 + 6, 1, 1, '#ff9a9a'); }
      if (body === 2) {
        RX(x0, y0 - 3, 1, 1, skin); RX(x0, y0 - 2, 2, 1, skin); RX(x0, y0 - 1, 3, 1, skin); RX(x0 + 1, y0 - 1, 1, 1, '#ff9ab0');
        R(11, y0 + 5, 2, 1, '#ff7a9a'); RX(x0 - 2, y0 + 5, 2, 1, skinD); RX(x0 - 2, y0 + 7, 2, 1, skinD);
        R(11, y0 + 6, 1, 1, ink); R(12, y0 + 6, 1, 1, ink);
      }
      if (body === 3) {
        R(x0 + 2, y0 + 3, 2, 3, '#14101c'); R(x0 + 6, y0 + 3, 2, 3, '#14101c');
        R(11, y0 + 6, 2, 1, '#14101c');
        for (var t = 0; t < 4; t++) R(x0 + 1 + t * 2, y0 + 8, 1, 1, '#14101c');
      }
    }
    // eyes
    var ey = y0 + 3, ec = (body === 1 || body === 3) ? acc : ink;
    switch (cfg.eyes) {
      case 0: R(9, ey + 1, 1, 2, ec); R(14, ey + 1, 1, 2, ec); break;
      case 1: R(8, ey, 3, 3, '#fff'); R(13, ey, 3, 3, '#fff'); R(9, ey + 1, 1, 2, ink); R(14, ey + 1, 1, 2, ink); break;
      case 2: R(9, ey + 1, 2, 2, ec); R(13, ey + 1, 2, 2, ec); R(8, ey, 2, 1, ink); R(14, ey, 2, 1, ink); R(10, ey + 1, 1, 1, ink); R(13, ey + 1, 1, 1, ink); break;
      case 3: R(9, ey, 1, 1, ec); R(8, ey + 1, 1, 1, ec); R(10, ey + 1, 1, 1, ec); R(14, ey, 1, 1, ec); R(13, ey + 1, 1, 1, ec); R(15, ey + 1, 1, 1, ec); break;
      case 4: R(9, ey, 2, 2, acc); R(13, ey, 2, 2, acc); R(9, ey, 1, 1, '#fff'); R(13, ey, 1, 1, '#fff'); break;
      case 5: R(10, ey, 4, 3, '#fff'); R(11, ey + 1, 2, 2, ink); R(11, ey + 1, 1, 1, acc); break;
    }
    // headwear
    var gold = '#ffd84a';
    switch (cfg.head) {
      case 1: R(x0 - 1, y0 - 1, 12, 2, out); R(x0 + 2, y0 - 2, 6, 1, out); RX(x0 - 1, y0 + 1, 2, 8, out); R(x0 + 2, y0, 6, 1, outD); break;
      case 2: R(x0 - 1, y0 - 1, 12, 4, '#9aa6b8'); R(x0 + 1, y0, 8, 1, '#cfd8e6'); RX(x0 - 1, y0 + 3, 1, 4, '#9aa6b8'); R(x0 - 1, y0 + 2, 12, 1, '#6a7488'); R(11, y0 - 3, 2, 2, acc); R(12, y0 - 4, 1, 1, acc); break;
      case 3: R(x0 - 2, y0, 14, 2, outD); R(x0 + 1, y0 - 1, 8, 1, out); R(x0 + 2, y0 - 2, 6, 1, out); R(x0 + 3, y0 - 3, 4, 1, out); R(x0 + 4, y0 - 4, 3, 1, out); R(x0 + 5, y0 - 5, 2, 1, out); R(x0 + 6, y0 - 6, 1, 1, out); R(x0 + 1, y0 - 1, 8, 1, acc); R(10, y0 - 3, 1, 1, gold); break;
      case 4: R(x0 + 1, y0 - 1, 8, 2, gold); R(x0 + 1, y0 - 3, 1, 2, gold); R(x0 + 4, y0 - 3, 2, 2, gold); R(x0 + 8, y0 - 3, 1, 2, gold); R(x0 + 4, y0 - 1, 2, 1, acc); break;
      case 5: R(x0, y0 + 1, 10, 2, acc); R(x0 + 10, y0 + 2, 2, 1, acc); R(x0 + 11, y0 + 3, 1, 2, accD); R(x0 + 2, y0 + 1, 1, 1, '#fff'); R(x0 + 6, y0 + 1, 1, 1, '#fff'); break;
      case 6: var hs = [2, 3, 4, 3, 2]; for (var i = 0; i < 5; i++) R(x0 + 3 + i, y0 + 1 - hs[i], 1, hs[i], acc); break;
      case 7: RX(x0 - 1, y0 - 1, 2, 2, '#e8e0c8'); RX(x0 - 2, y0 - 3, 2, 2, '#e8e0c8'); RX(x0 - 2, y0 - 4, 1, 1, '#e8e0c8'); break;
      case 8: R(x0 - 1, y0, 12, 1, '#201828'); R(x0 + 1, y0 - 5, 8, 5, '#201828'); R(x0 + 1, y0 - 1, 8, 1, acc); break;
      case 9: case 10: case 11:
        // hair colour follows the accent slot so it stays one swatch row
        var hc = G.data.hair[cfg.accent % G.data.hair.length], hd = shade(hc, -40), hl = shade(hc, 45);
        R(x0 + 1, y0 - 1, 8, 1, hc); R(x0, y0, 10, 2, hc); RX(x0 - 1, y0 + 1, 1, 3, hc); R(x0 + 2, y0 - 1, 3, 1, hl);
        R(x0, y0 + 2, 3, 1, hc); R(x0 + 7, y0 + 2, 3, 1, hd);
        if (cfg.head === 10) { RX(x0 - 1, y0 + 4, 1, 6, hc); RX(x0, y0 + 8, 1, 3, hd); }
        if (cfg.head === 11) { R(x0 + 2, y0 - 3, 6, 2, hc); R(x0 + 4, y0 - 4, 5, 1, hc); R(x0 + 3, y0 - 3, 3, 1, hl); }
        break;
    }
    outline(c, x, ink);
    return c;
  }

  S.buildCharacter = function (cfg) {
    var key = S.charKey(cfg);
    if (charCache[key]) return charCache[key];
    var o = { idle: [], walk: [], w: 24, h: 28, ax: 12, ay: 25 }, i;
    for (i = 0; i < 2; i++) o.idle.push(drawChar(cfg, false, i));
    for (i = 0; i < 4; i++) o.walk.push(drawChar(cfg, true, i));
    charCache[key] = o;
    return o;
  };

  // ---------- WEAPONS ----------
  var WPAL = { s: '#c8d0e0', d: '#7a8498', g: '#8a5a30', b: '#6a4020', y: '#ffd84a', p: '#b070ff', w: '#ffffff', c: '#40e0ff' };
  var WART = {
    pistola: [['..ssssss', '..sddsss', '.gg.....', '.g......'], 2, 1],
    escopeta: [['..ddssssssss', 'bbbddddddddd', 'bb..........'], 2, 1],
    metralha: [['..ddddssssss', '.bbddsssssdd', '.b..dd......', '....dd......'], 2, 1],
    cajado: [['...........ppp.', 'bbbbbbbbbbbpwpp', '...........ppp.'], 2, 1],
    laser: [['..dddddddddcc', 'ddsssssssssc.', '..dd.........'], 2, 1],
    espada: [['..y............', '.byssssssssssww', '..y............'], 2, 1]
  };
  var wcache = {};
  S.weapon = function (idx) {
    if (wcache[idx]) return wcache[idx];
    var id = G.data.weapons[idx].id, art = WART[id];
    var cv = fromMatrix(art[0], WPAL, false, 1);
    outline(cv, cv.getContext('2d'), OUT);
    return (wcache[idx] = { c: cv, ox: art[1] + 1, oy: art[2] + 1 });
  };

  // ---------- ENEMIES ----------
  var EART = {
    grunt: [['......', '..hbbb', '.bbbbb', 'bbebbb', 'bbbbbb', 'bbbmww', '.bbbbb', '..ccbb', '.ccbbb', '.cbbbb', '..cc.c', '..cc..'],
      { b: '#6cc04a', c: '#4a9a38', e: '#ffe14a', m: '#3a1020', w: '#fff', h: '#9ae070' }],
    archer: [['..dddd', '.ddpdd', 'dddsss', 'ddseess'.slice(0, 6), 'dddsss', '.dpppp', '.dpppp', 'dppppp', 'dpppdp', '.pdddp', '..dd.d', '..dd..'],
      { d: '#5a2a98', p: '#9a5ad8', s: '#2a1040', e: '#ffe14a' }],
    charger: [['w.....', 'wd..dd', '.dddrr', 'ddrrrr', 'drerrr', 'drrrrr', 'wrrrww', 'drrrrr', '.drrrr', '.dddrr', '..d.d.', '..d.d.'],
      { r: '#d84a3a', d: '#8a2a24', e: '#ffe14a', w: '#f0e8d0' }],
    caster: [['..cccc', '.cbbbb', 'cbbwww', 'cbwwkk', 'cbwkkk', 'cbwwkk', 'cbbwww', '.cbbbb', '..cbbb', '..c.cb', '...c.c', '......'],
      { c: '#2a6aa8', b: '#4aa8e8', w: '#fff', k: '#1a1030' }],
    slime: [['......', '......', '..dddd', '.dsssh', 'dsssss', 'dseess', 'dsssss', 'dssmmm', 'dsssss', 'dsssss', '.dsssd', '..dddd'],
      { s: '#58e0a0', d: '#2aa070', h: '#b8ffe0', e: '#1a1030', m: '#1a1030' }],
    mini: [['..dd', '.dss', 'dses', 'dsss', 'dsmm', 'dsss', '.dss', '..dd'],
      { s: '#ffa84a', d: '#c05a20', e: '#1a1030', m: '#5a1a10' }]
  };
  var BOSS = ['...c..c..c', '..cccccccc', '.bbbbbbbbb', 'bbbbbbbbbb', 'bbkkkkbbbb', 'bkkrrkkbbb', 'bkkrrkkbbb', 'bbkkkkbbbb', 'bbbbbbbbbk', '.bbbbbbbbb',
    '.bkbkbkbkb', '..dbbbbbbb', '..pppppppp', '.pppppqqqq', 'pppppqqqqq', 'ppbpppqqqq', 'ppbppppqqq', 'pppppppppp', '.ppppppppp', '..pp.pp.pp'];
  var BTH = [{ p: '#7a2ab0', q: '#4a1a78', r: '#e04a5a' }, { p: '#2a8a6a', q: '#1a5a48', r: '#ffe14a' }, { p: '#b0402a', q: '#782418', r: '#5af0ff' }];
  var ecache = {};
  S.enemy = function (type, variant) {
    var key = type + '_' + (variant || 0);
    if (ecache[key]) return ecache[key];
    var id = G.data.enemies[type].id, cv;
    if (id === 'boss') {
      var th = BTH[(variant || 0) % 3];
      cv = fromMatrix(BOSS, { c: '#ffd84a', b: '#e8e0d0', d: '#a89880', k: '#1a1020', r: th.r, p: th.p, q: th.q }, true, 1);
    } else {
      var art = EART[id];
      cv = fromMatrix(art[0], art[1], true, 1);
    }
    outline(cv, cv.getContext('2d'), OUT);
    return (ecache[key] = cv);
  };

  // ---------- PICKUPS ----------
  var pcache = {};
  S.pickup = function (name) {
    if (pcache[name]) return pcache[name];
    var cv;
    if (name === 'coin') cv = fromMatrix(['.yyyy.', 'yywwyy', 'yywyoy', 'yyyyoy', '.yooy.'], { y: '#ffd84a', w: '#fff3a0', o: '#c08a1a' }, false, 1);
    else if (name === 'energy') cv = fromMatrix(['..cc..', '.cwwc.', 'cwcccc', 'cwcccb', '.cccb.', '..bb..'], { c: '#40c8ff', w: '#fff', b: '#2060c0' }, false, 1);
    else if (name === 'heart') cv = fromMatrix(['.rr.rr.', 'rwrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'], { r: '#ff4a6a', w: '#ffb0c0' }, false, 1);
    else if (name === 'chest') {
      var a = mk(18, 16); var x = a[1]; cv = a[0];
      x.fillStyle = '#7a4a28'; x.fillRect(1, 5, 14, 9); x.fillStyle = '#9a6034'; x.fillRect(1, 2, 14, 4);
      x.fillStyle = '#ffd84a'; x.fillRect(1, 5, 14, 1); x.fillRect(7, 6, 2, 3); x.fillStyle = '#4a2a14'; x.fillRect(1, 12, 14, 2);
      x.fillStyle = '#ffd84a'; x.fillRect(3, 2, 1, 12); x.fillRect(12, 2, 1, 12);
      outline(cv, x, OUT);
    } else if (name === 'pedestal') {
      var b = mk(18, 8); cv = b[0]; b[1].fillStyle = '#6a6288'; b[1].fillRect(1, 2, 14, 5); b[1].fillStyle = '#8a82a8'; b[1].fillRect(1, 1, 14, 2);
      b[1].fillStyle = '#4a4468'; b[1].fillRect(1, 6, 14, 1); outline(cv, b[1], OUT);
    }
    if (cv && name !== 'chest' && name !== 'pedestal') outline(cv, cv.getContext('2d'), OUT);
    return (pcache[name] = cv);
  };

  // ---------- TILES ----------
  var THEMES = [
    { f1: '#7c74a6', f2: '#857db0', wt: '#2a2346', wf: '#a99be0', wd: '#6f62a8', mo: '#4a3f7c', ac: '#ffd84a' },
    { f1: '#6fa08a', f2: '#78aa93', wt: '#173530', wf: '#9ad6b4', wd: '#4f8f78', mo: '#2f6a58', ac: '#fff07a' },
    { f1: '#b0806a', f2: '#ba8a72', wt: '#3a1c1c', wf: '#e8a878', wd: '#a8644a', mo: '#7a3e30', ac: '#5af0ff' },
    { f1: '#8aa2c8', f2: '#94acd2', wt: '#1e2a4a', wf: '#c4daf8', wd: '#7890c0', mo: '#4a5f94', ac: '#ff7ab8' }
  ];
  S.themes = THEMES;
  var tcache = {};
  S.tiles = function (th) {
    if (tcache[th]) return tcache[th];
    var T = THEMES[th], o = { floor: [] }, i, a, x;
    // stone slabs: 0 plain, 1 lighter, 2 cracked, 3 pebbles, 4 rune
    for (i = 0; i < 5; i++) {
      a = mk(16, 16); x = a[1];
      x.fillStyle = i === 1 ? T.f2 : T.f1; x.fillRect(0, 0, 16, 16);
      x.fillStyle = 'rgba(255,255,255,0.07)'; x.fillRect(0, 0, 15, 1); x.fillRect(0, 0, 1, 15);
      x.fillStyle = 'rgba(0,0,0,0.26)'; x.fillRect(0, 15, 16, 1); x.fillRect(15, 0, 1, 16);
      if (i === 2) {
        x.fillStyle = 'rgba(0,0,0,0.32)';
        [[4, 3], [5, 4], [5, 5], [6, 6], [7, 6], [8, 7], [8, 8], [9, 9], [10, 9], [11, 10], [7, 7], [6, 8], [5, 9]].forEach(function (p) { x.fillRect(p[0], p[1], 1, 1); });
      } else if (i === 3) {
        x.fillStyle = 'rgba(255,255,255,0.10)'; x.fillRect(4, 5, 2, 1); x.fillRect(10, 10, 2, 1); x.fillRect(11, 4, 1, 1);
        x.fillStyle = 'rgba(0,0,0,0.28)'; x.fillRect(4, 6, 2, 1); x.fillRect(10, 11, 2, 1); x.fillRect(6, 11, 1, 1);
      } else if (i === 4) {
        x.globalAlpha = 0.35; x.fillStyle = T.ac;
        x.fillRect(7, 4, 2, 1); x.fillRect(5, 6, 1, 4); x.fillRect(10, 6, 1, 4); x.fillRect(7, 11, 2, 1); x.fillRect(7, 7, 2, 2);
        x.globalAlpha = 1;
      }
      o.floor.push(a[0]);
    }
    a = mk(16, 16); x = a[1]; x.fillStyle = T.wt; x.fillRect(0, 0, 16, 16);
    x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(2, 3, 4, 1); x.fillRect(9, 8, 5, 1); x.fillRect(4, 12, 3, 1);
    x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(2, 4, 4, 1); x.fillRect(9, 9, 5, 1);
    o.wallTop = a[0];
    a = mk(16, 16); x = a[1]; x.fillStyle = T.wf; x.fillRect(0, 0, 16, 16);
    x.fillStyle = T.mo;
    for (i = 5; i < 14; i += 4) x.fillRect(0, i, 16, 1);
    x.fillRect(4, 2, 1, 3); x.fillRect(12, 2, 1, 3); x.fillRect(8, 6, 1, 3); x.fillRect(0, 6, 1, 3); x.fillRect(4, 10, 1, 3); x.fillRect(12, 10, 1, 3);
    x.fillStyle = 'rgba(255,255,255,0.10)'; x.fillRect(5, 2, 7, 1); x.fillRect(9, 6, 7, 1); x.fillRect(5, 10, 7, 1);
    x.fillStyle = shade(T.wf, 45); x.fillRect(0, 0, 16, 2);          // lit cap
    x.fillStyle = shade(T.wf, 80); x.fillRect(0, 0, 16, 1);
    x.fillStyle = T.wd; x.fillRect(0, 13, 16, 3); x.fillStyle = T.mo; x.fillRect(0, 15, 16, 1);
    o.wallFace = a[0];
    // 2.5D: tall wall face (24px) seen from the front, with a lit cap
    a = mk(16, 24); x = a[1]; x.fillStyle = T.wf; x.fillRect(0, 0, 16, 24);
    x.fillStyle = T.mo;
    for (i = 6; i < 20; i += 4) x.fillRect(0, i, 16, 1);
    for (i = 0; i < 4; i++) { var jo = (i % 2) ? 4 : 0; x.fillRect(jo, 3 + i * 4, 1, 3); x.fillRect(jo + 8, 3 + i * 4, 1, 3); }
    x.fillStyle = 'rgba(255,255,255,0.13)';
    for (i = 0; i < 4; i++) { var jl = (i % 2) ? 5 : 1; x.fillRect(jl, 3 + i * 4, 6, 1); x.fillRect((jl + 8) % 16, 3 + i * 4, 6, 1); }
    x.fillStyle = shade(T.wf, 55); x.fillRect(0, 0, 16, 3);
    x.fillStyle = shade(T.wf, 95); x.fillRect(0, 0, 16, 1);
    x.fillStyle = T.wd; x.fillRect(0, 19, 16, 5); x.fillStyle = T.mo; x.fillRect(0, 23, 16, 1); x.fillRect(0, 19, 16, 1);
    o.wallTall = a[0];
    // props are 16x24 (drawn 8px above their tile) so they have height and y-sort against actors
    a = mk(16, 24); x = a[1];
    x.fillStyle = T.wd; x.fillRect(2, 19, 12, 4);
    x.fillStyle = T.wf; x.fillRect(3, 6, 10, 14);
    x.fillStyle = shade(T.wf, 40); x.fillRect(4, 6, 3, 14);
    x.fillStyle = T.wd; x.fillRect(11, 6, 2, 14);
    x.fillStyle = shade(T.wf, 30); x.fillRect(2, 2, 12, 5);
    x.fillStyle = shade(T.wf, 85); x.fillRect(2, 2, 12, 2);
    x.fillStyle = T.mo; x.fillRect(2, 6, 12, 1);
    outline(a[0], x, OUT);
    o.pillar = a[0];
    a = mk(16, 24); x = a[1];
    x.fillStyle = '#a8743c'; x.fillRect(1, 11, 14, 11);                  // front
    x.fillStyle = '#e0aa68'; x.fillRect(1, 4, 14, 7);                    // top
    x.fillStyle = '#f4cc8c'; x.fillRect(1, 4, 14, 1);
    x.fillStyle = '#7a4a24'; x.fillRect(1, 11, 14, 1); x.fillRect(1, 21, 14, 1); x.fillRect(1, 11, 1, 11); x.fillRect(14, 11, 1, 11);
    for (i = 0; i < 8; i++) { x.fillRect(3 + i, 13 + i, 2, 1); x.fillRect(11 - i, 13 + i, 2, 1); }
    x.fillStyle = '#c08a4c'; x.fillRect(5, 5, 1, 5); x.fillRect(10, 5, 1, 5);
    outline(a[0], x, OUT);
    o.crate = a[0];
    a = mk(16, 16); x = a[1]; x.fillStyle = '#0c0814'; x.fillRect(0, 0, 16, 16);
    x.fillStyle = T.ac; x.fillRect(0, 0, 1, 16); x.fillRect(15, 0, 1, 16); x.fillRect(0, 0, 16, 1);
    x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillRect(3, 4, 10, 2); x.fillRect(3, 9, 10, 2);
    o.doorOpen = a[0];
    a = mk(16, 16); x = a[1]; x.fillStyle = '#0c0814'; x.fillRect(0, 0, 16, 16);
    x.fillStyle = '#8890a8';
    for (i = 1; i < 16; i += 4) x.fillRect(i, 0, 2, 16);
    x.fillStyle = '#5a6078'; x.fillRect(0, 2, 16, 2); x.fillRect(0, 12, 16, 2);
    x.fillStyle = '#c8d0e8'; for (i = 1; i < 16; i += 4) x.fillRect(i, 0, 1, 16);
    x.fillStyle = '#ff4a5a'; x.fillRect(0, 7, 16, 1);
    o.doorShut = a[0];
    return (tcache[th] = o);
  };

  // static layer of a room (floor, walls, pillars)
  S.roomLayer = function (world) {
    // 2.5D layout: the layer has OY px of headroom above row 0 so north walls can stand 24px tall.
    // `over` holds the raised lip of south walls, drawn after actors so they walk behind it.
    var cols = world.cols, rows = world.rows, th = S.tiles(world.theme), OY = S.OY, LIP = 7;
    var a = mk(cols * 16, rows * 16 + OY), x = a[1], ov = mk(cols * 16, rows * 16 + OY), o = ov[1];
    var r = G.rng(world.seedv || 5), T = THEMES[world.theme], torches = [];
    x.fillStyle = T.wt; x.fillRect(0, 0, cols * 16, OY);
    x.translate(0, OY); o.translate(0, OY);
    function code(tx, ty) { return (tx < 0 || ty < 0 || tx >= cols || ty >= rows) ? 1 : world.grid[ty * cols + tx]; }
    for (var ty = 0; ty < rows; ty++) for (var tx = 0; tx < cols; tx++) {
      var c = code(tx, ty), px = tx * 16, py = ty * 16;
      if (c === 1) {
        var below = code(tx, ty + 1);
        if (below !== 1) {
          x.drawImage(th.wallTall, px, py - 8);
          if (tx % 5 === 2 && below !== 4 && code(tx - 1, ty + 1) !== 4 && code(tx + 1, ty + 1) !== 4) {
            x.fillStyle = '#2a1a14'; x.fillRect(px + 7, py + 3, 2, 6); x.fillRect(px + 5, py + 3, 6, 1);
            torches.push([px + 8, py + 1]);
          }
        } else {
          x.drawImage(th.wallTop, px, py);
          x.fillStyle = T.wd;
          if (code(tx + 1, ty) !== 1) x.fillRect(px + 13, py, 3, 16);
          if (code(tx - 1, ty) !== 1) x.fillRect(px, py, 3, 16);
          x.fillStyle = shade(T.wf, 30);
          if (code(tx + 1, ty) !== 1) x.fillRect(px + 13, py, 1, 16);
          if (code(tx - 1, ty) !== 1) x.fillRect(px + 2, py, 1, 16);
          if (code(tx, ty - 1) !== 1) {            // south wall: raised lip that hides feet behind it
            o.fillStyle = T.wt; o.fillRect(px, py - LIP, 16, LIP + 3);
            o.fillStyle = T.wd; o.fillRect(px, py - LIP, 16, 3);
            o.fillStyle = shade(T.wf, 30); o.fillRect(px, py - LIP, 16, 1);
          }
        }
      } else if (c === 4) {
        x.drawImage(th.doorOpen, px, py);
        if (code(tx, ty + 1) !== 1 && ty === 0) { x.fillStyle = '#0c0814'; x.fillRect(px, py - 8, 16, 8); x.fillStyle = T.ac; x.fillRect(px, py - 8, 16, 1); }
      } else {
        var rv = r.next();
        x.drawImage(th.floor[rv < 0.62 ? 0 : rv < 0.91 ? 1 : rv < 0.945 ? 2 : rv < 0.99 ? 3 : 4], px, py);
        // contact shadows cast by walls
        if (code(tx, ty - 1) === 1) { x.fillStyle = 'rgba(20,10,40,0.34)'; x.fillRect(px, py, 16, 4); x.fillStyle = 'rgba(20,10,40,0.16)'; x.fillRect(px, py + 4, 16, 4); }
        if (code(tx - 1, ty) === 1) { x.fillStyle = 'rgba(20,10,40,0.18)'; x.fillRect(px, py, 3, 16); }
        if (c === 2 || c === 3) { x.fillStyle = 'rgba(20,10,40,0.3)'; x.fillRect(px + 1, py + 12, 15, 4); }
      }
    }
    a[0].torches = torches; a[0].over = ov[0];
    return a[0];
  };
  S.OY = 32;

  // tall props (pillar=2, crate=3) of a world, for y-sorting against actors
  S.drawProp = function (ctx, world, c, tx, ty) {
    var th = S.tiles(world.theme);
    ctx.drawImage(c === 3 ? th.crate : th.pillar, tx * 16, ty * 16 - 8);
  };

  // stepped (banded) pixel glow, drawn additively
  var gcache = {};
  S.glow = function (ctx, x, y, r, col, alpha) {
    var g = gcache[col];
    if (!g) {
      var a = mk(32, 32), c = a[1];
      c.fillStyle = col;
      for (var yy = 0; yy < 32; yy++) for (var xx = 0; xx < 32; xx++) {
        var d = Math.sqrt((xx - 15.5) * (xx - 15.5) + (yy - 15.5) * (yy - 15.5)) / 16;
        var al = d < 0.3 ? 0.55 : d < 0.52 ? 0.34 : d < 0.76 ? 0.18 : d < 1 ? 0.08 : 0;
        if (al) { c.globalAlpha = al; c.fillRect(xx, yy, 1, 1); }
      }
      g = gcache[col] = a[0];
    }
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha == null ? 0.5 : alpha;
    ctx.drawImage(g, Math.round(x - r), Math.round(y - r), r * 2, r * 2);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  };

  // animated wall torches of a room layer
  S.drawTorches = function (ctx, layer, t) {
    var ts = layer.torches || [];
    for (var i = 0; i < ts.length; i++) {
      var tx = ts[i][0], ty = ts[i][1], fl = Math.floor(t * 9 + i * 1.7) % 3;
      ctx.fillStyle = '#ff7a2a'; ctx.fillRect(tx - 2, ty - 2 - fl, 4, 4 + fl);
      ctx.fillStyle = '#ffc04a'; ctx.fillRect(tx - 1, ty - 1 - fl, 2, 3 + fl);
      ctx.fillStyle = '#fff3b0'; ctx.fillRect(tx - 1 + (fl === 1 ? 1 : 0), ty, 1, 2);
    }
  };
  S.drawTorchGlow = function (ctx, layer, t) {
    var ts = layer.torches || [];
    for (var i = 0; i < ts.length; i++) S.glow(ctx, ts[i][0], ts[i][1] + 8, 30 + (Math.floor(t * 9 + i * 1.7) % 3), '#ffb060', 0.3);
  };

  S.vignette = function () {
    if (S._vig) return S._vig;
    var a = mk(G.W, G.H), x = a[1];
    var g = x.createRadialGradient(G.W / 2, G.H / 2, G.H * 0.45, G.W / 2, G.H / 2, G.W * 0.62);
    g.addColorStop(0, 'rgba(8,4,20,0)'); g.addColorStop(1, 'rgba(8,4,20,0.3)');
    x.fillStyle = g; x.fillRect(0, 0, G.W, G.H);
    return (S._vig = a[0]);
  };

  // ---------- PIXEL FONT 3x5 ----------
  var GL = {
    '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
    '5': '111100111001111', '6': '111100111101111', '7': '111001001010010', '8': '111101111101111', '9': '111101111001111',
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
    F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
    K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
    P: '110101110100100', Q: '010101101111011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
    U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
    Z: '111001010100111', '-': '000000111000000', '+': '000010111010000', '!': '010010010000010', '.': '000000000000010',
    ':': '000010000010000', '/': '001001010100100', '?': '111001010000010', '%': '101001010100101', ',': '000000000010100',
    '$': '011110011011110', '_': '000000000000111', ' ': '000000000000000'
  };
  G.font = {
    width: function (s, sc) { return s.length * 4 * (sc || 1) - (sc || 1); },
    draw: function (ctx, str, x, y, col, sc, align, shadow) {
      sc = sc || 1; str = String(str);
      try { str = str.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) {}
      str = str.toUpperCase();
      var w = str.length * 4 * sc - sc;
      if (align === 'c') x -= Math.floor(w / 2); else if (align === 'r') x -= w;
      x = Math.round(x); y = Math.round(y);
      for (var pass = (shadow === false ? 1 : 0); pass < 2; pass++) {
        ctx.fillStyle = pass === 0 ? '#000' : col;
        var ox = pass === 0 ? sc : 0, oy = pass === 0 ? sc : 0;
        for (var i = 0; i < str.length; i++) {
          var g = GL[str[i]] || GL['?'], cx = x + i * 4 * sc + ox;
          for (var k = 0; k < 15; k++) if (g[k] === '1') ctx.fillRect(cx + (k % 3) * sc, y + oy + Math.floor(k / 3) * sc, sc, sc);
        }
      }
    }
  };
})(window.G);
