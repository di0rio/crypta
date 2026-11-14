(function (G) {
  'use strict';
  var S = G.sprites, E = G.entities, U = G.ui, N = G.net;
  var canvas, ctx;
  var game = G.game = { scene: null, name: 'menu', paused: false, tick: 0, modeId: null, over: null };
  var STEP = 1 / 60;

  // ---------- session ----------
  function newSession(role, local) { G.session = { role: role, local: local || 0, players: {}, rseq: 0, code: null }; }
  function addPlayer(slot, name, cfg) {
    var p = E.makePlayer(slot, name, cfg);
    p.local = slot === G.session.local; G.session.players[slot] = p; return p;
  }
  function roster() {
    var pl = G.session.players;
    return Object.keys(pl).map(function (k) { return { slot: pl[k].slot, name: pl[k].name, cfg: pl[k].cfg }; });
  }
  function applyRoster(list) {
    var pl = G.session.players, keep = {};
    list.forEach(function (r) {
      keep[r.slot] = 1;
      var cfg = G.data.cleanChar(r.cfg);
      if (!pl[r.slot]) addPlayer(r.slot, cfg.name, cfg);
      else { pl[r.slot].name = cfg.name; pl[r.slot].cfg = cfg; }
    });
    Object.keys(pl).forEach(function (k) { if (!keep[k]) delete pl[k]; });
  }
  function sendRoster() { N.broadcast({ t: 'roster', players: roster() }); }

  // ---------- scenes ----------
  function setScene(s, name) {
    if (game.scene && game.scene.exit) game.scene.exit();
    game.scene = s; game.name = name; game.paused = false;
    U.hideAll(); s.enter();
  }
  function enterHub() {
    game.over = null; game.modeId = null;
    setScene(G.hub.create(), 'hub');
    U.setRoom(G.session.code);
  }
  function beginMode(id, seed) {
    var def = G.modes.get(id); if (!def) return;
    game.modeId = id; game.over = null;
    setScene(def.create({ role: G.session.role, seed: seed }), 'mode');
    U.setRoom(G.session.code);
  }
  game.startMode = function (id) {
    var seed = G.randi(1, 1e9);
    N.broadcast({ t: 'start', mode: id, seed: seed });
    beginMode(id, seed);
  };
  game.restart = function () { if (G.session.role !== 'client' && game.modeId) game.startMode(game.modeId); };
  game.toHub = function () {
    if (G.session.role === 'client') return;
    N.broadcast({ t: 'hub' }); enterHub();
  };
  game.gameOver = function (stats) {
    game.over = stats; game.paused = false;
    if (G.session.role === 'host') N.broadcast({ t: 'over', stats: stats });
    U.over(stats, G.session.role !== 'client');
  };
  game.setPaused = function (v) {
    if (v) { U.show('pause'); game.paused = G.session.role === 'solo'; }
    else { U.hideAll(); game.paused = false; }
  };
  game.toMenu = function () {
    N.close();
    if (game.scene && game.scene.exit) game.scene.exit();
    game.scene = null; game.name = 'menu'; game.paused = false; game.over = null;
    newSession('solo', 0);
    U.hideHud(); U.show('menu'); U.menuMsg('');
    $menuHint();
  };
  function $menuHint() { if (!N.available()) U.menuMsg('ONLINE INDISPONIVEL - SO SOLO'); }

  // ---------- entry points ----------
  game.startSolo = function () {
    N.close(); newSession('solo', 0);
    addPlayer(0, U.cfg.name, U.cfg); enterHub();
  };
  game.hostRoom = function () {
    U.menuMsg('Criando sala...');
    N.host(function (code) {
      newSession('host', 0); G.session.code = code;
      addPlayer(0, U.cfg.name, U.cfg); enterHub();
      U.toast('SALA ' + code + ' CRIADA', 3000);
    }, function (err) { U.menuMsg(err); U.toast(err, 4500); });
  };
  game.joinRoom = function (code) {
    U.menuMsg('Conectando...');
    N.join(code, function (c) {
      G.session.pendingCode = c;
      N.toHost({ t: 'hello', name: U.cfg.name, cfg: U.cfg });
    }, function (err) { U.menuMsg(err); U.toast(err, 4500); game.name === 'menu' || game.toMenu(); });
  };

  // ---------- network messages ----------
  N.handlers.message = function (msg, slot) {
    if (!msg || !msg.t) return;
    var ses = G.session, pl = ses.players, p;
    if (ses.role === 'host') {
      switch (msg.t) {
        case 'hello':
          if (game.name !== 'hub') {
            N.sendTo(slot, { t: 'reject', reason: 'Partida em andamento. Tente de novo no hub.' }); N.kick(slot); return;
          }
          var cfg = G.data.cleanChar(msg.cfg);
          p = addPlayer(slot, cfg.name, cfg);
          p.x = 208 + (slot - 1.5) * 22; p.y = 170;
          N.sendTo(slot, { t: 'welcome', slot: slot, players: roster() });
          sendRoster();
          U.toast(cfg.name + ' ENTROU', 2000);
          break;
        case 'cfg':
          p = pl[slot]; if (!p) return;
          p.cfg = G.data.cleanChar(msg.cfg); p.name = p.cfg.name; sendRoster(); break;
        case 'in':
          p = pl[slot]; if (!p) return;
          if (msg.rs === ses.rseq) { p.x = +msg.x || 0; p.y = +msg.y || 0; p.ib.push(performance.now(), p.x, p.y); }
          p.vx = +msg.vx || 0; p.vy = +msg.vy || 0; p.aim = +msg.a || 0; p.firing = !!msg.f; p.eHeld = !!msg.e; p.moving = !!msg.m;
          if (msg.c) { p.ctr.ue = msg.c[0] | 0; p.ctr.de = msg.c[1] | 0; p.ctr.sw = msg.c[2] | 0; }
          break;
      }
      return;
    }
    // client
    switch (msg.t) {
      case 'welcome':
        newSession('client', msg.slot); G.session.code = G.session.pendingCode || N.code;
        applyRoster(msg.players); enterHub(); U.toast('CONECTADO!', 1800); break;
      case 'roster': applyRoster(msg.players); break;
      case 'reject':
        N.close(); U.menuMsg(msg.reason); U.toast(msg.reason, 4500); if (game.name !== 'menu') game.toMenu(); U.menuMsg(msg.reason); break;
      case 'start': beginMode(msg.mode, msg.seed); break;
      case 'hub': enterHub(); break;
      case 'over': game.over = msg.stats; U.over(msg.stats, false); break;
      case 'snap':
        if (game.scene && msg.k === game.name && game.scene.applySnapshot) game.scene.applySnapshot(msg.d);
        break;
    }
  };
  N.handlers.leave = function (slot) {
    var p = G.session.players[slot];
    if (p) { U.toast(p.name + ' SAIU', 2000); delete G.session.players[slot]; sendRoster(); }
  };
  N.handlers.hostLeft = function () {
    U.toast('O HOST SAIU DA SALA', 4500);
    game.toMenu(); U.menuMsg('O host saiu da sala.');
  };

  function netTick() {
    var ses = G.session;
    if (!game.scene) return;
    if (ses.role === 'client' && game.tick % 2 === 0) {
      var lp = ses.players[ses.local]; if (!lp) return;
      var r1 = function (v) { return Math.round(v * 10) / 10; };
      N.toHost({ t: 'in', x: r1(lp.x), y: r1(lp.y), vx: Math.round(lp.vx), vy: Math.round(lp.vy), a: +lp.aim.toFixed(2), f: lp.firing ? 1 : 0, e: lp.eHeld ? 1 : 0, m: lp.moving ? 1 : 0, c: [lp.ctr.ue, lp.ctr.de, lp.ctr.sw], rs: ses.rseq });
    } else if (ses.role === 'host' && game.tick % 4 === 0 && N.hasClients()) {
      N.broadcast({ t: 'snap', k: game.name, d: game.scene.serialize() });
    }
  }

  // ---------- loop ----------
  function tick(dt) {
    game.tick++;
    G.input.blocked = U.modalOpen();
    if (G.input.press.Escape) {
      var cur = U.current();
      if (cur === 'pause') game.setPaused(false);
      else if (cur === 'char') { U.show('menu'); }
      else if (!cur && game.scene) game.setPaused(true);
    }
    if (game.scene && !game.paused) game.scene.update(dt);
    netTick();
    G.input.endTick();
  }
  game.tickOnce = tick;

  var menuChars = null;
  function drawMenuBg(t) {
    var th = S.tiles(0);
    ctx.fillStyle = '#0a0710'; ctx.fillRect(0, 0, G.W, G.H);
    var off = Math.floor(t * 6) % 16;
    for (var y = -1; y < 18; y++) for (var x = -1; x < 31; x++) ctx.drawImage(th.floor[(x + y + 9) % 3], x * 16 - off, y * 16 - off);
    ctx.fillStyle = 'rgba(8,5,16,0.55)'; ctx.fillRect(0, 0, G.W, G.H);
    if (!menuChars) { menuChars = []; for (var i = 0; i < 5; i++) menuChars.push({ cfg: i === 0 ? U.cfg : G.data.randomChar('x'), sp: 22 + i * 7, o: i * 110 }); }
    menuChars.forEach(function (c, i) {
      var fr = S.buildCharacter(i === 0 ? U.cfg : c.cfg), px = ((t * c.sp + c.o) % (G.W + 60)) - 30, py = G.H - 34 + (i % 2) * 14;
      S.shadow(ctx, px, py + 6, 6);
      ctx.drawImage(fr.walk[Math.floor(t * 10 + i) % 4], Math.round(px) - 12, py - 19);
    });
    ctx.drawImage(S.vignette(), 0, 0);
  }

  // rAF stops in a hidden tab; in multiplayer keep simulating (a worker timer is not throttled)
  // so a host that alt-tabs does not freeze the room for everyone.
  try {
    var bgw = new Worker(URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},16)'], { type: 'text/javascript' })));
    var bgLast = 0;
    bgw.onmessage = function () {
      var now = performance.now();
      if (!document.hidden || G.session.role === 'solo' || !game.scene) { bgLast = now; return; }
      var n = Math.min(8, Math.round((now - bgLast) / (STEP * 1000)));
      if (n < 1) return;
      bgLast = now;
      while (n--) tick(STEP);
    };
  } catch (e) {}

  var last = 0, acc = 0, mt = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = (now - last) / 1000; last = now;
    if (dt > 0.25) dt = 0.25; if (dt < 0) dt = 0;
    acc += dt; mt += dt;
    var n = 0;
    while (acc >= STEP && n < 5) { tick(STEP); acc -= STEP; n++; }
    if (n === 5) acc = 0;
    ctx.imageSmoothingEnabled = false;
    if (game.scene) game.scene.draw(ctx); else drawMenuBg(mt);
    if (U.current() === 'char') U.drawPreview(dt);
  }

  function resize() {
    var iw = window.innerWidth, ih = window.innerHeight, s = Math.min(iw / G.W, ih / G.H);
    if (s >= 1) s = Math.floor(s);
    var w = G.W * s, h = G.H * s, l = (iw - w) / 2, t = (ih - h) / 2;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; canvas.style.left = l + 'px'; canvas.style.top = t + 'px';
    G.input.view = { left: l, top: t, scale: s };
  }

  // ---------- debug ----------
  G.debug.state = function () {
    var pl = G.session.players, sc = game.scene, sum = sc && sc.summary ? sc.summary() : null;
    return {
      screen: game.name, ui: U.current(), role: G.session.role, mode: game.modeId,
      floor: sum && sum.floor || null, room: sum && sum.room || null,
      players: Object.keys(pl).map(function (k) { var p = pl[k]; return { slot: p.slot, name: p.name, hp: p.hp, x: Math.round(p.x), y: Math.round(p.y), down: p.down }; }),
      enemies: sum && sum.enemies !== undefined ? sum.enemies : 0, over: !!game.over
    };
  };
  G.debug.startSolo = function () { game.startSolo(); return G.debug.state(); };
  G.debug.startDungeon = function () { game.startSolo(); game.startMode('dungeon'); return G.debug.state(); };
  G.debug.step = function (n) { for (var i = 0; i < (n || 1); i++) tick(STEP); return G.debug.state(); };

  // ---------- init ----------
  function init() {
    canvas = document.getElementById('game'); ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
    G.input.init(canvas); U.init();
    window.addEventListener('resize', resize); resize();
    var unlock = function () { G.audio.init(); };
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
    newSession('solo', 0);
    U.show('menu'); $menuHint();
    var m = /[?&]sala=([A-Za-z0-9]+)/.exec(location.search);
    if (m) {
      var code = m[1].toUpperCase().slice(0, 5);
      document.getElementById('join-code').value = code;
      document.getElementById('join-box').classList.remove('hidden');
      if (N.available()) setTimeout(function () { game.joinRoom(code); }, 300);
    }
    requestAnimationFrame(function (t) { last = t; requestAnimationFrame(frame); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window.G);
