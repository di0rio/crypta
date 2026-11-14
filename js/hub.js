(function (G) {
  'use strict';
  var E = G.entities, S = G.sprites, F = G.fx, T = 16;

  function drawPortal(ctx, x, y, t, c1, c2, locked) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x - 12, y + 10, 24, 3);
    for (var i = 0; i < 30; i++) {
      var an = t * (locked ? 0.6 : 2.5) + i * 0.5, rad = 3 + i * 0.5;
      ctx.fillStyle = i % 3 === 0 ? '#ffffff' : (i % 2 ? c1 : c2);
      ctx.fillRect(Math.round(x + Math.cos(an) * rad), Math.round(y + Math.sin(an) * rad * 1.15), 2, 2);
    }
    ctx.strokeStyle = locked ? '#4a4660' : c1; ctx.lineWidth = 2;
    ctx.strokeRect(x - 16, y - 19, 32, 38);
  }

  G.hub = {
    create: function () {
      var world = G.dungeon.hubWorld(), t = 0, portals = [], snapT = 0;
      var modes = G.modes.list;
      modes.forEach(function (m, i) { portals.push({ x: 136 + i * 144, y: 72, mode: m, locked: false }); });
      portals.push({ x: 136 + modes.length * 144, y: 72, mode: null, locked: true });
      var self = {
        world: world, summary: function () { return { players: Object.keys(G.session.players).length }; },
        enter: function () {
          F.clear(); G.cam.reset(); t = 0; G.session.rseq = 0;
          var pl = G.session.players;
          Object.keys(pl).forEach(function (k) {
            var p = pl[k]; p.x = world.pw / 2 + (p.slot - 1.5) * 22; p.y = world.ph - 52; p.vx = p.vy = 0; p.down = false; p.ib.reset();
            p.ctr = { ue: 0, de: 0, sw: 0 }; p.seen = { ue: 0, de: 0, sw: 0 };
          });
          G.ui.showHud('hub');
          var lp = G.session.players[G.session.local];
          G.cam.follow(world, lp.x, lp.y, 0, true);
        },
        update: function (dt) {
          t += dt;
          var ses = G.session, lp = ses.players[ses.local], pl = ses.players, onPortal = null;
          if (lp) E.updateLocal(lp, world, dt);
          Object.keys(pl).forEach(function (k) {
            var p = pl[k]; if (!p.local) E.animate(p, dt);
            portals.forEach(function (pt) { if (Math.hypot(p.x - pt.x, p.y + 4 - pt.y) < 16 && p.slot === ses.local) onPortal = pt; });
          });
          // host/solo: any player stepping on a mode portal starts it
          if (ses.role !== 'client') {
            Object.keys(pl).forEach(function (k) {
              var p = pl[k];
              portals.forEach(function (pt) {
                if (!pt.locked && Math.hypot(p.x - pt.x, p.y + 4 - pt.y) < 16 && p.slot === ses.local && !self.starting) {
                  self.starting = true; G.game.startMode(pt.mode.id);
                }
              });
            });
          }
          var hint = '';
          if (onPortal) hint = onPortal.locked ? 'EM BREVE' : (ses.role === 'client' ? 'ESPERANDO O HOST' : '');
          else hint = ses.role === 'client' ? 'ANDE ATE UM PORTAL - SO O HOST INICIA' : 'ANDE ATE O PORTAL PARA COMECAR';
          G.ui.hint(hint);
          if (lp) G.cam.follow(world, lp.x, lp.y, dt, false);
          G.cam.update(dt); F.update(dt);
          snapT -= dt;
          if (snapT <= 0) {
            snapT = 0.2;
            var map = [];
            for (var k in pl) { var pp = pl[k]; map.push({ gx: 0, gy: 0 }); }
            G.ui.updateHud({ local: lp, players: Object.keys(pl).map(function (k) { return pl[k]; }), label: 'HUB', map: null });
          }
          portals.forEach(function (pt) { if (!pt.locked && Math.random() < 0.3) F.add(pt.x + G.rand(-12, 12), pt.y + 16, 0, -25, 0.6, '#a070ff', 1, 0, 1); });
        },
        draw: function (ctx) {
          var cam = G.cam, now = performance.now(), i;
          ctx.fillStyle = '#0a0710'; ctx.fillRect(0, 0, G.W, G.H);
          ctx.save(); ctx.translate(-Math.round(cam.x + cam.sx), -Math.round(cam.y + cam.sy));
          ctx.drawImage(world.layer(), 0, -S.OY);
          G.font.draw(ctx, 'CRYPTA', world.pw / 2, 4, '#ffd84a', 3, 'c');
          // torches
          S.drawTorches(ctx, world.layer(), t);
          var tl = S.tiles(world.theme);
          portals.forEach(function (pt) {
            drawPortal(ctx, pt.x, pt.y, t, pt.locked ? '#6a6688' : '#a070ff', pt.locked ? '#4a4660' : '#5af0ff', pt.locked);
            G.font.draw(ctx, pt.locked ? 'EM BREVE' : pt.mode.name, pt.x, pt.y - 32, pt.locked ? '#8a86a8' : '#ffffff', 1, 'c');
            if (!pt.locked) G.font.draw(ctx, 'PORTAL', pt.x, pt.y + 24, '#a070ff', 1, 'c');
            else G.font.draw(ctx, 'TRANCADO', pt.x, pt.y + 24, '#6a6688', 1, 'c');
          });
          var pl = G.session.players, list = Object.keys(pl).map(function (k) { return pl[k]; });
          var acts = list.map(function (p) { return { y: E.renderPos(p).y, p: p }; });
          for (i = 0; i < world.grid.length; i++) if (world.grid[i] === 2) acts.push({ y: Math.floor(i / world.cols) * 16 + 12, tx: i % world.cols, ty: Math.floor(i / world.cols) });
          acts.sort(function (a, b) { return a.y - b.y; });
          acts.forEach(function (a) { if (a.p) E.drawPlayer(ctx, a.p, true); else S.drawProp(ctx, world, 2, a.tx, a.ty); });
          ctx.drawImage(world.layer().over, 0, -S.OY);
          F.draw(ctx);
          S.drawTorchGlow(ctx, world.layer(), t);
          portals.forEach(function (pt) { if (!pt.locked) S.glow(ctx, pt.x, pt.y, 46, '#a070ff', 0.4); });
          list.forEach(function (p) { var gp = E.renderPos(p); S.glow(ctx, gp.x, gp.y, 40, '#fff0c8', 0.10); });
          ctx.restore();
          ctx.drawImage(S.vignette(), 0, 0);
        },
        onNet: function () {},
        serialize: function () {
          var o = [];
          var pl = G.session.players;
          Object.keys(pl).forEach(function (k) {
            var p = pl[k]; o.push([p.slot, Math.round(p.x), Math.round(p.y), +p.aim.toFixed(2), p.moving ? 1 : 0, p.cur, p.weapons[0]]);
          });
          return { p: o };
        },
        applySnapshot: function (s) {
          var now = performance.now(), pl = G.session.players;
          s.p.forEach(function (a) {
            var p = pl[a[0]]; if (!p || p.local) return;
            p.x = a[1]; p.y = a[2]; p.aim = a[3]; p.moving = !!a[4]; p.ib.push(now, a[1], a[2]);
          });
        },
        exit: function () { F.clear(); G.ui.hint(''); }
      };
      return self;
    }
  };
})(window.G);
