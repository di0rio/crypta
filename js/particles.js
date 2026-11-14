(function (G) {
  'use strict';
  var F = G.fx = { p: [], txt: [], swings: [] };
  var rand = G.rand;

  F.clear = function () { F.p.length = 0; F.txt.length = 0; F.swings.length = 0; };
  F.add = function (x, y, vx, vy, life, col, size, g, drag) {
    if (F.p.length > 700) F.p.shift();
    F.p.push({ x: x, y: y, vx: vx, vy: vy, life: life, max: life, col: col, size: size || 1, g: g || 0, drag: drag === undefined ? 3 : drag });
  };
  F.sparks = function (x, y, col, n) {
    n = n || 5;
    for (var i = 0; i < n; i++) {
      var a = rand(0, 6.283), s = rand(30, 100);
      F.add(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.15, 0.35), col, 1, 0, 4);
    }
  };
  F.explosion = function (x, y, col) {
    var cols = [col, '#ffffff', '#ffd84a'];
    for (var i = 0; i < 22; i++) {
      var a = rand(0, 6.283), s = rand(20, 150);
      F.add(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.25, 0.6), cols[i % 3], i % 4 === 0 ? 2 : 1, 0, 3);
    }
  };
  F.deathBurst = function (x, y, col) {
    for (var i = 0; i < 16; i++) {
      var a = rand(0, 6.283), s = rand(25, 110);
      F.add(x, y, Math.cos(a) * s, Math.sin(a) * s - 15, rand(0.3, 0.7), i % 3 ? col : '#ffffff', i % 5 === 0 ? 2 : 1, 160, 2);
    }
  };
  F.dust = function (x, y) {
    for (var i = 0; i < 4; i++) F.add(x + rand(-3, 3), y + rand(-1, 1), rand(-20, 20), rand(-15, 5), rand(0.2, 0.4), '#9a90b0', 1, 0, 3);
  };
  F.muzzle = function (x, y, a, style) {
    F.add(x, y, 0, 0, 0.05, '#fff8c0', 4, 0, 0);
    for (var i = 0; i < 3; i++) {
      var aa = a + rand(-0.4, 0.4), s = rand(60, 140);
      F.add(x, y, Math.cos(aa) * s, Math.sin(aa) * s, rand(0.08, 0.18), '#ffe066', 1, 0, 6);
    }
  };
  F.ring = function (x, y, col) {
    for (var i = 0; i < 12; i++) {
      var a = i / 12 * 6.283;
      F.add(x, y, Math.cos(a) * 50, Math.sin(a) * 50, 0.4, col, 1, 0, 4);
    }
  };
  F.debris = function (x, y) {
    var cols = ['#8a5a30', '#a8743c', '#6a4020'];
    for (var i = 0; i < 8; i++) F.add(x, y, rand(-70, 70), rand(-90, -10), rand(0.3, 0.6), cols[i % 3], 2, 260, 1);
  };
  F.text = function (x, y, str, col) { F.txt.push({ x: x, y: y, str: str, col: col || '#fff', life: 0.85, max: 0.85, vy: -34 }); };
  F.swing = function (x, y, a, range) { F.swings.push({ x: x, y: y, a: a, range: range, t: 0 }); };

  F.update = function (dt) {
    var i, p;
    for (i = F.p.length - 1; i >= 0; i--) {
      p = F.p[i]; p.life -= dt;
      if (p.life <= 0) { F.p[i] = F.p[F.p.length - 1]; F.p.pop(); continue; }
      p.vy += p.g * dt;
      var d = Math.max(0, 1 - p.drag * dt); p.vx *= d; if (!p.g) p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (i = F.txt.length - 1; i >= 0; i--) {
      p = F.txt[i]; p.life -= dt; p.y += p.vy * dt; p.vy *= Math.max(0, 1 - 3 * dt);
      if (p.life <= 0) F.txt.splice(i, 1);
    }
    for (i = F.swings.length - 1; i >= 0; i--) { F.swings[i].t += dt; if (F.swings[i].t > 0.2) F.swings.splice(i, 1); }
  };
  F.draw = function (ctx) {
    var i, p;
    for (i = 0; i < F.p.length; i++) {
      p = F.p[i];
      ctx.globalAlpha = Math.min(1, p.life / p.max * 1.6);
      ctx.fillStyle = p.col;
      ctx.fillRect(Math.round(p.x - p.size / 2), Math.round(p.y - p.size / 2), p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (i = 0; i < F.swings.length; i++) {
      var s = F.swings[i], pr = s.t / 0.2;
      for (var k = 0; k <= 12; k++) {
        var f = k / 12; if (f > pr * 1.3 + 0.1) break;
        var an = s.a - 1.1 + f * 2.2, al = 1 - pr;
        ctx.globalAlpha = Math.max(0, al * (0.4 + f * 0.6));
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(s.x + Math.cos(an) * s.range * 0.85), Math.round(s.y + Math.sin(an) * s.range * 0.85), 2, 2);
        ctx.fillStyle = '#8af0ff';
        ctx.fillRect(Math.round(s.x + Math.cos(an) * s.range * 0.65), Math.round(s.y + Math.sin(an) * s.range * 0.65), 1, 1);
      }
    }
    ctx.globalAlpha = 1;
    for (i = 0; i < F.txt.length; i++) {
      p = F.txt[i];
      ctx.globalAlpha = Math.min(1, p.life / p.max * 2);
      G.font.draw(ctx, p.str, p.x, p.y, p.col, 1, 'c');
    }
    ctx.globalAlpha = 1;
  };

  // camera
  var C = G.cam = { x: 0, y: 0, shake: 0, sx: 0, sy: 0 };
  C.follow = function (world, tx, ty, dt, snap) {
    var W = G.W, H = G.H;
    var lead = { x: (G.input.mouse.x - W / 2) * 0.12, y: (G.input.mouse.y - H / 2) * 0.12 };
    var cx = tx - W / 2 + lead.x, cy = ty - H / 2 + lead.y;
    if (world.pw <= W) cx = (world.pw - W) / 2; else cx = G.clamp(cx, 0, world.pw - W);
    if (world.ph <= H) cy = (world.ph - H) / 2; else cy = G.clamp(cy, -24, world.ph - H);
    if (snap) { C.x = cx; C.y = cy; } else { var k = Math.min(1, dt * 7); C.x += (cx - C.x) * k; C.y += (cy - C.y) * k; }
  };
  C.update = function (dt) {
    C.shake = Math.max(0, C.shake - dt * 22);
    var s = Math.floor(C.shake);
    C.sx = s ? G.randi(-s, s) : 0; C.sy = s ? G.randi(-s, s) : 0;
  };
  C.reset = function () { C.x = 0; C.y = 0; C.shake = 0; C.sx = 0; C.sy = 0; };
})(window.G);
