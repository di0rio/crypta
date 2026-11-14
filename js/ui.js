(function (G) {
  'use strict';
  var U = G.ui = { cfg: null };
  function $(id) { return document.getElementById(id); }
  var cache = {};
  function setText(id, v) { if (cache[id] !== v) { cache[id] = v; $(id).textContent = v; } }
  function setW(id, frac) { var v = Math.round(G.clamp(frac, 0, 1) * 100) + '%'; if (cache['w' + id] !== v) { cache['w' + id] = v; $(id).style.width = v; } }

  U.screens = ['menu', 'char', 'pause', 'over'];
  U.show = function (name) { U.screens.forEach(function (s) { $('screen-' + s).classList.toggle('hidden', s !== name); }); };
  U.hideAll = function () { U.show(null); };
  U.current = function () { for (var i = 0; i < U.screens.length; i++) if (!$('screen-' + U.screens[i]).classList.contains('hidden')) return U.screens[i]; return null; };
  U.modalOpen = function () { var c = U.current(); return c === 'pause' || c === 'over' || c === 'menu' || c === 'char'; };

  var toastT = 0;
  U.toast = function (msg, ms) {
    var t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.add('hidden'); }, ms || 3200);
  };
  U.menuMsg = function (msg) { $('menu-msg').textContent = msg || ''; };

  U.showHud = function (mode) {
    $('hud').classList.remove('hidden');
    $('hud-left').classList.toggle('hidden', mode !== 'game');
    $('hud-map').classList.toggle('hidden', mode !== 'game');
    cache = {};
  };
  U.hideHud = function () { $('hud').classList.add('hidden'); U.setBoss(null); U.hint(''); U.setRoom(null); };
  U.hint = function (txt) {
    var h = $('hud-hint');
    if (cache.hint !== txt) { cache.hint = txt; h.textContent = txt; h.classList.toggle('hidden', !txt); }
  };
  U.setBoss = function (name, frac) {
    var b = $('hud-boss');
    if (!name) { if (cache.boss !== null) { cache.boss = null; b.classList.add('hidden'); } return; }
    if (cache.boss === null || cache.boss === undefined) b.classList.remove('hidden');
    cache.boss = name; setText('boss-name', name.toUpperCase()); setW('boss-fill', frac);
  };
  U.setRoom = function (code) {
    var el = $('hud-code');
    if (!code) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden'); $('room-code').textContent = code;
  };

  U.updateHud = function (d) {
    var p = d.local, D = G.data;
    if (p && !$('hud-left').classList.contains('hidden')) {
      setW('bar-hp', p.hp / p.maxHp); setText('txt-hp', p.hp + '/' + p.maxHp);
      setW('bar-sh', p.sh / p.maxSh); setText('txt-sh', p.sh + '/' + p.maxSh);
      setW('bar-en', p.en / p.maxEn); setText('txt-en', Math.floor(p.en) + '/' + p.maxEn);
      setText('txt-coins', String(p.coins));
      var w0 = D.weapons[p.weapons[p.cur]], w1 = D.weapons[p.weapons[1 - p.cur]];
      setText('w-cur', w0 ? w0.name.toUpperCase() : '-');
      setText('w-alt', w1 ? 'Q: ' + w1.name.toUpperCase() : '');
    }
    var pl = d.players || [], lp = $('hud-players');
    if (pl.length > 1) {
      lp.classList.remove('hidden');
      var html = pl.map(function (q) {
        var pips = '';
        for (var i = 0; i < q.maxHp; i++) pips += '<i class="' + (i < q.hp ? 'on' : '') + '"></i>';
        return '<div class="pl' + (q.down ? ' down' : '') + (q.local ? ' me' : '') + '"><span class="nm">' + esc(q.name) + '</span><span class="pips">' + pips + '</span></div>';
      }).join('');
      if (cache.pl !== html) { cache.pl = html; lp.innerHTML = html; }
    } else lp.classList.add('hidden');
    if (d.map) { setText('hud-floor', d.label); drawMinimap(d.map); }
  };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var TYPE_COL = { start: '#58b848', combat: '#7a68c8', chest: '#ffd84a', shop: '#4aa8ff', boss: '#e0405a' };
  function drawMinimap(map) {
    var c = $('minimap'), x = c.getContext('2d'), cw = c.width, ch = c.height;
    x.clearRect(0, 0, cw, ch);
    var minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    map.forEach(function (r) { minx = Math.min(minx, r.gx); maxx = Math.max(maxx, r.gx); miny = Math.min(miny, r.gy); maxy = Math.max(maxy, r.gy); });
    var nx = maxx - minx + 1, ny = maxy - miny + 1;
    var unit = Math.min(20, Math.floor((cw - 4) / nx), Math.floor((ch - 4) / ny));
    var rw = Math.max(5, Math.round(unit * 0.66)), rh = Math.max(4, Math.round(rw * 0.7));
    var ox = Math.floor((cw - nx * unit) / 2) + Math.floor((unit - rw) / 2), oy = Math.floor((ch - ny * unit) / 2) + Math.floor((unit - rh) / 2);
    function pos(r) { return [ox + (r.gx - minx) * unit, oy + (r.gy - miny) * unit]; }
    x.fillStyle = '#4a4468';
    map.forEach(function (r, i) {
      if (!r.known) return;
      var a = pos(r);
      for (var k in r.links) {
        var o = map[r.links[k]]; if (!o.known || r.links[k] < i) continue;
        var b = pos(o);
        x.fillRect(Math.min(a[0], b[0]) + Math.floor(rw / 2) - 1, Math.min(a[1], b[1]) + Math.floor(rh / 2) - 1, Math.abs(a[0] - b[0]) + 2, Math.abs(a[1] - b[1]) + 2);
      }
    });
    map.forEach(function (r) {
      if (!r.known) return;
      var a = pos(r);
      x.fillStyle = '#000'; x.fillRect(a[0] - 1, a[1] - 1, rw + 2, rh + 2);
      x.fillStyle = r.visited ? (r.cleared || r.type !== 'combat' ? TYPE_COL[r.type] : '#a05a5a') : '#3a3650';
      x.fillRect(a[0], a[1], rw, rh);
      if (!r.visited) { x.fillStyle = '#6a6688'; x.fillRect(a[0] + Math.floor(rw / 2) - 1, a[1] + Math.floor(rh / 2) - 1, 2, 2); }
      if (r.cur) { x.fillStyle = '#fff'; x.fillRect(a[0] + Math.floor(rw / 2) - 1, a[1] + Math.floor(rh / 2) - 1, 3, 3); }
    });
  }

  // ---------- character screen ----------
  var preview = { t: 0 };
  function saveCfg() { G.data.saveChar(U.cfg); }
  function buildChar() {
    var D = G.data, root = $('char-opts'); root.innerHTML = '';
    function row(label) {
      var r = document.createElement('div'); r.className = 'orow';
      var l = document.createElement('div'); l.className = 'olbl'; l.textContent = label; r.appendChild(l);
      var b = document.createElement('div'); b.className = 'obody'; r.appendChild(b); root.appendChild(r); return b;
    }
    function choices(label, names, key) {
      var body = row(label);
      names.forEach(function (n, i) {
        var b = document.createElement('button'); b.className = 'opt'; b.textContent = n; b.dataset.k = key; b.dataset.i = i;
        b.onclick = function () { U.cfg[key] = i; saveCfg(); refreshChar(); G.audio.play('ui'); };
        body.appendChild(b);
      });
    }
    function swatches(label, cols, key) {
      var body = row(label);
      cols.forEach(function (c, i) {
        var b = document.createElement('button'); b.className = 'sw'; b.style.background = c; b.dataset.k = key; b.dataset.i = i; b.title = c;
        b.onclick = function () { U.cfg[key] = i; saveCfg(); refreshChar(); G.audio.play('ui'); };
        body.appendChild(b);
      });
    }
    var nb = row('NOME'), inp = document.createElement('input');
    inp.id = 'char-name'; inp.maxLength = 12; inp.autocomplete = 'off'; inp.spellcheck = false;
    inp.oninput = function () { U.cfg.name = inp.value.slice(0, 12) || 'Heroi'; saveCfg(); };
    nb.appendChild(inp);
    choices('CORPO', D.bodies, 'body');
    swatches('PELE / METAL', D.palettes.skin, 'skin');
    swatches('ROUPA', D.palettes.outfit, 'outfit');
    swatches('DETALHE', D.palettes.accent, 'accent');
    choices('CABECA', D.heads, 'head');
    choices('OLHOS', D.eyes, 'eyes');
    choices('COSTAS', D.backs, 'back');
  }
  function refreshChar() {
    var els = $('char-opts').querySelectorAll('[data-k]');
    for (var i = 0; i < els.length; i++) els[i].classList.toggle('sel', U.cfg[els[i].dataset.k] === parseInt(els[i].dataset.i, 10));
    var inp = $('char-name'); if (document.activeElement !== inp) inp.value = U.cfg.name;
  }
  U.drawPreview = function (dt) {
    var c = $('preview'), x = c.getContext('2d');
    preview.t += dt; x.imageSmoothingEnabled = false;
    x.fillStyle = '#1a1426'; x.fillRect(0, 0, c.width, c.height);
    var th = G.sprites.tiles(3);
    for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) x.drawImage(th.floor[(i + j) % 3], i * 32, j * 32, 32, 32);
    var fr = G.sprites.buildCharacter(U.cfg), walking = Math.floor(preview.t / 3) % 2 === 1;
    var img = walking ? fr.walk[Math.floor(preview.t * 10) % 4] : fr.idle[Math.floor(preview.t * 2.5) % 2];
    var s = 4, cx = c.width / 2, cy = c.height / 2 + 22;
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(cx - 28, cy + 20, 56, 8); x.fillRect(cx - 20, cy + 28, 40, 4);
    x.save(); x.translate(cx, cy); x.scale(Math.cos(preview.t * 0.7) >= 0 ? s : -s, s); x.drawImage(img, -12, -19); x.restore();
    var wp = G.sprites.weapon(0);
    x.save(); x.translate(cx, cy + 4); x.scale(s, s); x.translate(3, 0); x.drawImage(wp.c, -wp.ox, -wp.oy); x.restore();
  };
  U.openChar = function () { refreshChar(); U.show('char'); };
  U.randomize = function () { U.cfg = G.data.randomChar(U.cfg.name); saveCfg(); refreshChar(); };

  U.over = function (stats, canRestart) {
    $('over-stats').innerHTML = [
      ['ANDAR', stats.floor], ['SALAS LIMPAS', stats.rooms], ['INIMIGOS', stats.kills], ['MOEDAS', stats.coins], ['TEMPO', Math.floor(stats.time / 60) + ':' + ('0' + (stats.time % 60)).slice(-2)]
    ].map(function (r) { return '<div><span>' + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('');
    $('b-over-again').classList.toggle('hidden', !canRestart);
    $('over-wait').classList.toggle('hidden', canRestart);
    U.show('over');
  };

  U.init = function () {
    U.cfg = G.data.loadChar();
    buildChar(); refreshChar();
    function on(id, fn) { $(id).onclick = function () { G.audio.init(); G.audio.play('ui'); fn(); }; }
    on('b-solo', function () { G.game.startSolo(); });
    on('b-host', function () { G.game.hostRoom(); });
    on('b-join', function () { $('join-box').classList.remove('hidden'); $('join-code').focus(); });
    on('b-join-cancel', function () { $('join-box').classList.add('hidden'); });
    on('b-join-go', function () { G.game.joinRoom($('join-code').value); });
    $('join-code').addEventListener('keydown', function (e) { if (e.key === 'Enter') G.game.joinRoom($('join-code').value); });
    $('join-code').oninput = function () { this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); };
    on('b-char', function () { U.openChar(); });
    on('b-rand', function () { U.randomize(); });
    on('b-char-back', function () { saveCfg(); U.show('menu'); });
    on('b-resume', function () { G.game.setPaused(false); });
    on('b-pause-mute', function () { G.audio.setMuted(!G.audio.muted); U.refreshMute(); });
    on('b-menu-mute', function () { G.audio.setMuted(!G.audio.muted); U.refreshMute(); });
    on('b-quit', function () { G.game.toMenu(); });
    on('b-over-again', function () { G.game.restart(); });
    on('b-over-menu', function () { G.game.toMenu(); });
    on('b-copy', function () { U.copyLink(); });
    U.refreshMute();
  };
  U.refreshMute = function () {
    var t = G.audio.muted ? 'SOM: DESLIGADO' : 'SOM: LIGADO';
    $('b-pause-mute').textContent = t; $('b-menu-mute').textContent = t;
  };
  U.copyLink = function () {
    var code = G.session.code; if (!code) return;
    var url = location.origin + location.pathname + '?sala=' + code;
    if (location.protocol === 'file:') url = location.href.split('?')[0].split('#')[0] + '?sala=' + code;
    function done() { U.toast('LINK COPIADO!', 1800); }
    try { navigator.clipboard.writeText(url).then(done, function () { window.prompt('Copie o link:', url); }); }
    catch (e) { window.prompt('Copie o link:', url); }
  };
})(window.G);
