(function (G) {
  'use strict';
  var S = G.sprites, E = G.entities = {};
  var SPEED = 78;

  E.makePlayer = function (slot, name, cfg) {
    var p = {
      slot: slot, name: name, cfg: G.data.cleanChar(cfg), local: false,
      x: 0, y: 0, vx: 0, vy: 0, aim: 0, face: 1, t: Math.random() * 5, moving: false, firing: false, eHeld: false,
      dashT: 0, dashCd: 0, dashX: 0, dashY: 0, ctr: { ue: 0, de: 0, sw: 0 }, seen: { ue: 0, de: 0, sw: 0 },
      ib: new G.Interp(), kick: 0, flash: 0, hint: ''
    };
    E.resetRun(p);
    return p;
  };
  E.resetRun = function (p) {
    p.maxHp = 7; p.hp = 7; p.maxSh = 4; p.sh = 4; p.maxEn = 100; p.en = 100; p.coins = 0;
    p.weapons = [0, -1]; p.cur = 0; p.cd = 0; p.down = false; p.revive = 0; p.iframes = 0;
    p.sinceHit = 0; p.shAcc = 0; p.kills = 0; p.dashCd = 0; p.dashT = 0; p.flash = 0;
  };

  function boxSolid(world, x, y, hw) {
    return world.solidAt(x - hw, y - hw) || world.solidAt(x + hw, y - hw) || world.solidAt(x - hw, y + hw) || world.solidAt(x + hw, y + hw);
  }
  // axis-separated move; returns true if blocked
  E.moveBox = function (e, dx, dy, world, hw) {
    var blocked = false;
    if (dx) { var nx = e.x + dx; if (!boxSolid(world, nx, e.y, hw)) e.x = nx; else blocked = true; }
    if (dy) { var ny = e.y + dy; if (!boxSolid(world, e.x, ny, hw)) e.y = ny; else blocked = true; }
    return blocked;
  };

  E.renderPos = function (p) {
    if (p.local || !p.ib || !p.ib.b.length) return p;
    return p.ib.get(performance.now() - 110) || p;
  };

  // visual-only per tick state for any player
  E.animate = function (p, dt) {
    p.t += dt; if (p.flash > 0) p.flash -= dt; if (p.kick > 0) p.kick = Math.max(0, p.kick - dt * 40);
    if (!p.local) { p.face = Math.cos(p.aim) >= 0 ? 1 : -1; }
  };

  E.updateLocal = function (p, world, dt) {
    var I = G.input;
    E.animate(p, dt);
    p.dashCd -= dt;
    if (p.down) { p.moving = false; p.vx = p.vy = 0; p.firing = false; p.eHeld = false; p.dashT = 0; return; }
    var mx = 0, my = 0;
    if (I.isDown('KeyA') || I.isDown('ArrowLeft')) mx -= 1;
    if (I.isDown('KeyD') || I.isDown('ArrowRight')) mx += 1;
    if (I.isDown('KeyW') || I.isDown('ArrowUp')) my -= 1;
    if (I.isDown('KeyS') || I.isDown('ArrowDown')) my += 1;
    var len = Math.hypot(mx, my); if (len) { mx /= len; my /= len; }
    p.aim = Math.atan2(I.mouse.y + G.cam.y - p.y, I.mouse.x + G.cam.x - p.x);
    p.face = Math.cos(p.aim) >= 0 ? 1 : -1;
    if (I.pressed('Space') && p.dashCd <= 0) {
      p.dashT = 0.16; p.dashCd = 0.85;
      p.dashX = len ? mx : Math.cos(p.aim); p.dashY = len ? my : Math.sin(p.aim);
      p.ctr.de++; G.audio.play('dash');
    }
    var vx, vy;
    if (p.dashT > 0) {
      p.dashT -= dt; vx = p.dashX * 250; vy = p.dashY * 250;
      if (Math.random() < 0.8) G.fx.dust(p.x, p.y + 5);
    } else { vx = mx * SPEED; vy = my * SPEED; }
    E.moveBox(p, vx * dt, vy * dt, world, 4);
    p.vx = vx; p.vy = vy; p.moving = len > 0 || p.dashT > 0;
    p.firing = I.fire();
    if (I.pressed('KeyE')) p.ctr.ue++;
    p.eHeld = I.isDown('KeyE');
    if (I.pressed('KeyQ')) p.ctr.sw++;
  };

  E.drawWeapon = function (ctx, p, x, y) {
    var wi = p.weapons[p.cur]; if (wi === undefined || wi < 0) return;
    var w = S.weapon(wi), a = p.aim;
    ctx.save();
    ctx.translate(x, y + 1); ctx.rotate(a);
    if (Math.cos(a) < 0) ctx.scale(1, -1);
    ctx.translate(3 - p.kick, 0);
    ctx.drawImage(w.c, -w.ox, -w.oy);
    ctx.restore();
  };

  E.drawPlayer = function (ctx, p, showName) {
    var pos = E.renderPos(p), x = Math.round(pos.x), y = Math.round(pos.y);
    var fr = S.buildCharacter(p.cfg);
    // fake Z: dash is a small hop with squash & stretch; the shadow stays on the ground
    var hop = p.dashT > 0 ? Math.sin(Math.min(1, p.dashT / 0.16) * Math.PI) : 0, z = Math.round(hop * 6);
    var sx = 1 + hop * 0.18, sy = 1 - hop * 0.14;
    if (p.kick > 0.5) { sx *= 0.94; sy *= 1.05; }
    S.shadow(ctx, x, y + 6, 6 - z * 0.3);
    y -= z;
    var img = p.moving ? fr.walk[Math.floor(p.t * 10) % 4] : fr.idle[Math.floor(p.t * 2.5) % 2];
    if (p.flash > 0) img = S.flash(img);
    if (p.down) img = S.grey(img);
    var blink = p.iframes > 0 && !p.down && Math.floor(p.t * 18) % 2 === 0;
    if (blink) ctx.globalAlpha = 0.45;
    if (p.down) {
      ctx.save(); ctx.translate(x, y + 3); ctx.rotate(Math.PI / 2); ctx.drawImage(img, -12, -16); ctx.restore();
    } else {
      var behind = Math.sin(p.aim) < 0;
      if (behind) E.drawWeapon(ctx, p, x, y);
      ctx.save(); ctx.translate(x, y);
      ctx.translate(0, 6); ctx.scale(p.face < 0 ? -sx : sx, sy); ctx.translate(0, -6);
      ctx.drawImage(img, -12, -19);
      ctx.restore();
      if (!behind) E.drawWeapon(ctx, p, x, y);
    }
    ctx.globalAlpha = 1;
    if (showName) G.font.draw(ctx, p.name, x, y - 28, p.down ? '#ff8a8a' : '#ffffff', 1, 'c');
  };
})(window.G);
