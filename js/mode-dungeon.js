(function (G) {
  'use strict';
  var T = 16, D = G.data, S = G.sprites, E = G.entities, F = G.fx, PK = D.PK, R = Math.round;
  var OPP = G.dungeon.OPP;

  function DM(ctx) {
    this.host = ctx.role !== 'client';
    this.seed = ctx.seed;
    this.enemies = []; this.bullets = []; this.pickups = []; this.events = []; this.spawnQ = [];
    this.nextId = 1; this.rseq = 0; this.t = 0; this.floorNum = 1;
    this.room = null; this.world = null; this.dun = null;
    this.banner = null; this.fade = 0; this.hurtFlash = 0; this.over = false; this.overT = 0;
    this.stats = { kills: 0, rooms: 0, coins: 0, t: 0 };
    this.eMap = new Map(); this.bMap = new Map(); this.kMap = new Map();
    this.hudT = 0; this.entrySide = 0;
  }
  var P = DM.prototype;

  // ---------- helpers ----------
  P.plist = function () { var o = G.session.players; return Object.keys(o).map(function (k) { return o[k]; }); };
  P.local = function () { return G.session.players[G.session.local]; };
  P.getWorld = function (room) { return room.world || (room.world = G.dungeon.buildWorld(room, this.floorNum)); };
  P.emit = function (ev) { this.fx(ev); if (this.host && G.net.hasClients()) this.events.push(ev); };
  P.loadFloor = function (n) { this.floorNum = n; this.dun = G.dungeon.generate(this.seed, n); };
  P.eDmg = function () { return this.floorNum >= 3 ? 2 : 1; };
  P.alive = function () { return this.plist().filter(function (p) { return !p.down; }); };

  P.fx = function (ev) {
    var k = ev[0], ses = G.session;
    switch (k) {
      case 'num': F.text(ev[1], ev[2], String(ev[3]), ev[4]); break;
      case 'sfx': G.audio.play(ev[1]); break;
      case 'boom': F.explosion(ev[1], ev[2], ev[3] || '#ff9a3a'); G.cam.shake = Math.max(G.cam.shake, ev[4] || 4); G.audio.play('boom'); break;
      case 'die': F.deathBurst(ev[1], ev[2], ev[3]); G.audio.play('death'); break;
      case 'muz': F.muzzle(ev[1], ev[2], ev[3]); break;
      case 'swing': F.swing(ev[1], ev[2], ev[3], ev[4]); break;
      case 'spark': F.sparks(ev[1], ev[2], ev[3], ev[4]); break;
      case 'banner': this.banner = { text: ev[1], t: 2.4, max: 2.4 }; break;
      case 'dust': F.dust(ev[1], ev[2]); break;
      case 'spawn': F.ring(ev[1], ev[2], '#a070ff'); break;
      case 'crate': F.debris(ev[1], ev[2]); break;
      case 'hurt':
        var pl = ses.players[ev[1]];
        if (pl) pl.flash = 0.15;
        if (ev[1] === ses.local) { G.cam.shake = Math.max(G.cam.shake, 6); this.hurtFlash = 0.3; }
        break;
    }
  };

  // ---------- lifecycle ----------
  P.enter = function () {
    var ses = G.session;
    ses.rseq = 0; this.rseq = 0;
    F.clear(); G.cam.reset();
    this.loadFloor(1);
    this.plist().forEach(function (p) { E.resetRun(p); p.seen = { ue: p.ctr.ue, de: p.ctr.de, sw: p.ctr.sw }; p.ib.reset(); });
    if (this.host) {
      this.enterRoom(this.dun.start, null);
      this.emit(['banner', 'ANDAR 1']);
    } else {
      this.room = this.dun.start; this.world = this.getWorld(this.room);
      this.placePlayers(null);
    }
    G.ui.showHud('game');
    G.cam.follow(this.world, this.local().x, this.local().y, 0, true);
  };
  P.exit = function () { F.clear(); G.cam.reset(); G.ui.setBoss(null); G.ui.hint(''); };

  P.placePlayers = function (side) {
    var room = this.room;
    this.plist().forEach(function (p) {
      var pos = G.dungeon.entryPos(room, side, p.slot);
      p.x = pos.x; p.y = pos.y; p.vx = p.vy = 0; p.ib.reset();
    });
  };

  P.mkPickup = function (k, x, y, a, b, c) {
    return { id: this.nextId++, k: k, x: x, y: y, a: a || 0, b: b || 0, c: c || 0, vx: 0, vy: 0, t: 0, dead: false };
  };
  P.drop = function (k, x, y, a) {
    var p = this.mkPickup(k, x, y, a);
    var an = G.rand(0, 6.283), s = G.rand(30, 70); p.vx = Math.cos(an) * s; p.vy = Math.sin(an) * s;
    this.pickups.push(p); return p;
  };
  P.randWeapon = function () { return G.randi(1, D.weapons.length - 1); };
  P.initPickups = function (room) {
    var list = [], cx = room.cols * 8, cy = room.rows * 8;
    if (room.type === 'chest') list.push(this.mkPickup(PK.CHEST, cx, cy));
    if (room.type === 'shop') {
      list.push(this.mkPickup(PK.SHOP, cx - 44, cy, 0, 8));
      list.push(this.mkPickup(PK.SHOP, cx, cy, 1, 6));
      list.push(this.mkPickup(PK.SHOP, cx + 44, cy, 2, 16 + this.floorNum * 4, this.randWeapon()));
    }
    return list;
  };

  // host: move everybody into a room
  P.enterRoom = function (room, side) {
    if (this.room) this.room.pk = this.pickups;
    this.room = room; this.world = this.getWorld(room); room.visited = true;
    this.bullets = []; this.enemies = []; this.spawnQ = [];
    this.rseq++; G.session.rseq = this.rseq; this.entrySide = side || 0;
    if (!room.broken) room.broken = [];
    this.pickups = room.pk || (room.pk = this.initPickups(room));
    this.placePlayers(side);
    if (room.state === null) room.state = (room.type === 'combat' || room.type === 'boss') ? 0 : 2;
    if (room.state === 0) {
      room.state = 1; this.world.locked = true;
      room.wavesLeft = room.type === 'boss' ? 1 : (this.floorNum >= 3 ? 3 : 2); room.waveT = 1.3;
      this.emit(['sfx', 'door']);
    } else this.world.locked = room.state === 1;
    this.fade = 0.4;
    G.cam.follow(this.world, this.local().x, this.local().y, 0, true);
  };

  P.nextFloor = function () {
    this.floorNum++;
    this.loadFloor(this.floorNum);
    this.room = null;
    this.plist().forEach(function (p) { if (!p.down) { p.hp = Math.min(p.maxHp, p.hp + 2); } else { p.down = false; p.hp = 2; } p.sh = p.maxSh; p.iframes = 1.5; });
    this.enterRoom(this.dun.start, null);
    this.emit(['banner', 'ANDAR ' + this.floorNum]); this.emit(['sfx', 'portal']);
  };

  // ---------- host simulation ----------
  P.simulate = function (dt) {
    var players = this.plist(), room = this.room, i;
    this.stats.t += dt;
    for (i = 0; i < players.length; i++) this.stepPlayer(players[i], dt);
    this.stepRevive(players, dt);
    if (room.state === 1) this.stepWaves(dt);
    this.stepEnemies(dt);
    this.stepBullets(dt);
    this.stepPickups(dt);
    this.checkDoors(players);
    if (!this.over && players.length && players.every(function (p) { return p.down; })) {
      this.over = true; this.overT = 1.4;
    }
    if (this.over && (this.overT -= dt) <= 0 && !this.over2) { this.over2 = true; this.gameOver(); }
  };

  P.gameOver = function () {
    var s = this.stats;
    G.game.gameOver({ floor: this.floorNum, rooms: s.rooms, kills: s.kills, coins: s.coins, time: Math.round(s.t) });
  };

  P.stepPlayer = function (p, dt) {
    var local = p.local;
    if (!local) E.animate(p, dt);
    p.cd -= dt; if (p.iframes > 0) p.iframes -= dt;
    if (p.ctr.de !== p.seen.de) {
      p.seen.de = p.ctr.de; p.iframes = Math.max(p.iframes, 0.3);
      if (!local) { this.emit(['dust', R(p.x), R(p.y + 5)]); this.emit(['sfx', 'dash']); }
    }
    if (p.ctr.sw !== p.seen.sw) { p.seen.sw = p.ctr.sw; this.swapWeapon(p); }
    if (p.ctr.ue !== p.seen.ue) { p.seen.ue = p.ctr.ue; if (!p.down) this.interact(p); }
    if (p.down) return;
    if (p.firing && p.cd <= 0) this.fire(p);
    p.sinceHit += dt;
    if (p.sinceHit > 3 && p.sh < p.maxSh) { p.shAcc += dt; if (p.shAcc >= 0.6) { p.shAcc = 0; p.sh++; } }
  };

  P.swapWeapon = function (p) {
    if (p.weapons[1] < 0) return;
    p.cur = 1 - p.cur; this.emit(['sfx', 'ui']);
  };

  P.fire = function (p) {
    var w = D.weapons[p.weapons[p.cur]]; if (!w) return;
    if (w.en > p.en) { p.cd = 0.3; this.emit(['sfx', 'empty']); return; }
    p.en -= w.en; p.cd = w.rate; p.kick = 2;
    var a = p.aim, ca = Math.cos(a), sa = Math.sin(a);
    if (w.melee) { this.swing(p, w); return; }
    for (var i = 0; i < w.count; i++) {
      var aa = a + (w.count > 1 ? (i / (w.count - 1) - 0.5) * w.spread * 2 + G.rand(-0.04, 0.04) : G.rand(-w.spread, w.spread));
      this.spawnBullet('p', p.x + ca * 9, p.y + 1 + sa * 9, aa, w.speed, w.dmg, w.style, w.life, p.slot, w.pierce || 0, w.bounce || 0);
    }
    this.emit(['muz', R(p.x + ca * 10), R(p.y + 1 + sa * 10), +a.toFixed(2)]);
    this.emit(['sfx', w.snd]);
  };

  P.swing = function (p, w) {
    var half = w.arc / 2, i, e, b, cx = p.x, cy = p.y + 1;
    for (i = 0; i < this.enemies.length; i++) {
      e = this.enemies[i]; if (e.dead || e.spawnT > 0) continue;
      var dx = e.x - cx, dy = e.y - cy, d = Math.hypot(dx, dy);
      if (d < w.range + e.r) {
        var an = Math.atan2(dy, dx);
        if (Math.abs(G.angDiff(p.aim, an)) < half || d < e.r + 8) this.hurtEnemy(e, w.dmg, an, w.kb, p);
      }
    }
    for (i = 0; i < this.bullets.length; i++) {
      b = this.bullets[i]; if (b.team !== 'e' || b.dead) continue;
      var bx = b.x - cx, by = b.y - cy;
      if (Math.hypot(bx, by) < w.range + 6 && Math.abs(G.angDiff(p.aim, Math.atan2(by, bx))) < half + 0.2) {
        b.dead = true; this.emit(['spark', R(b.x), R(b.y), '#8af0ff', 4]);
      }
    }
    for (var r = 10; r <= w.range; r += 10) for (var an2 = -half; an2 <= half; an2 += 0.35) {
      var px = cx + Math.cos(p.aim + an2) * r, py = cy + Math.sin(p.aim + an2) * r;
      if (this.world.tileAt(px, py) === 3) this.breakCrate(Math.floor(px / T), Math.floor(py / T));
    }
    this.emit(['swing', R(cx), R(cy), +p.aim.toFixed(2), w.range]);
    this.emit(['sfx', 'swing']);
  };

  P.spawnBullet = function (team, x, y, ang, speed, dmg, style, life, owner, pierce, bounce) {
    this.bullets.push({
      id: this.nextId++, x: x, y: y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: D.bullets[style].r,
      dmg: dmg, team: team, life: life, style: style, owner: owner, pierce: pierce || 0, bounce: bounce || 0, hit: [], dead: false
    });
  };
  P.ebullet = function (x, y, ang, speed, style) { this.spawnBullet('e', x, y, ang, speed, this.eDmg(), style, 5, -1, 0, 0); };

  P.breakCrate = function (tx, ty) {
    var w = this.world, idx = ty * w.cols + tx;
    if (w.grid[idx] !== 3) return;
    w.grid[idx] = 0; this.room.broken.push(idx);
    this.emit(['crate', tx * T + 8, ty * T + 8]); this.emit(['sfx', 'hit']);
    if (Math.random() < 0.3) this.drop(PK.COIN, tx * T + 8, ty * T + 8);
  };

  P.hurtEnemy = function (e, dmg, ang, kb, owner) {
    if (e.dead || e.spawnT > 0) return;
    e.hp -= dmg; e.flash = 0.1;
    if (owner) owner.dmg = (owner.dmg || 0) + dmg;
    this.emit(['num', R(e.x), R(e.y - e.r - 6), Math.round(dmg), '#ffffff']);
    this.emit(['sfx', 'hit']);
    if (e.type === 6) kb *= 0.05;
    e.kx += Math.cos(ang) * (kb || 0); e.ky += Math.sin(ang) * (kb || 0);
    if (e.hp <= 0) this.killEnemy(e, owner);
  };

  P.killEnemy = function (e, owner) {
    if (e.dead) return;
    e.dead = true; this.stats.kills++; if (owner) owner.kills++;
    var def = D.enemies[e.type], i;
    this.emit(['die', R(e.x), R(e.y), def.col]);
    if (def.id === 'slime') {
      for (i = 0; i < 2; i++) { var m = this.makeEnemy(5, e.x + (i ? 8 : -8), e.y); m.spawnT = 0.25; this.spawnQ.push(m); }
    } else if (def.id === 'mini') {
      for (i = 0; i < 6; i++) this.ebullet(e.x, e.y, i / 6 * 6.283 + G.rand(0, 1), 80, 5);
      this.emit(['boom', R(e.x), R(e.y), '#ffa84a', 2]);
      this.alive().forEach(function (p) { if (Math.hypot(p.x - e.x, p.y - e.y) < 20) this.hurtPlayer(p, 1); }, this);
    } else if (def.id === 'boss') {
      this.enemies.forEach(function (o) { if (o !== e && !o.dead) { o.dead = true; this.emit(['die', R(o.x), R(o.y), D.enemies[o.type].col]); } }, this);
      this.bullets.forEach(function (b) { if (b.team === 'e') b.dead = true; });
      for (i = 0; i < 5; i++) this.emit(['boom', R(e.x + G.rand(-14, 14)), R(e.y + G.rand(-14, 14)), '#ffd84a', 8]);
      for (i = 0; i < 14; i++) this.drop(PK.COIN, e.x, e.y);
      this.drop(PK.HEART, e.x, e.y); this.drop(PK.ENERGY, e.x, e.y);
      this.room.waveT = 0.6;
    }
    var r = Math.random();
    if (def.id !== 'boss') {
      if (r < 0.55) this.drop(PK.COIN, e.x, e.y);
      else if (r < 0.75) this.drop(PK.ENERGY, e.x, e.y);
      else if (r < 0.8) this.drop(PK.HEART, e.x, e.y);
    }
  };

  P.hurtPlayer = function (p, dmg) {
    if (p.down || p.iframes > 0 || this.over) return;
    p.sinceHit = 0; p.shAcc = 0; p.iframes = 0.8; p.flash = 0.15;
    var rem = dmg;
    if (p.sh > 0) { var a = Math.min(p.sh, rem); p.sh -= a; rem -= a; }
    if (rem > 0) p.hp -= rem;
    this.emit(['hurt', p.slot]);
    this.emit(['num', R(p.x), R(p.y - 14), '-' + dmg, '#ff5a6a']);
    this.emit(['sfx', 'hurt']);
    if (p.hp <= 0) {
      p.hp = 0; p.down = true; p.revive = 0; p.firing = false;
      this.emit(['boom', R(p.x), R(p.y), '#ff5a6a', 5]);
      this.emit(['num', R(p.x), R(p.y - 22), 'CAIDO', '#ff8a8a']);
    }
  };

  P.stepRevive = function (players, dt) {
    for (var i = 0; i < players.length; i++) {
      var d = players[i]; if (!d.down) continue;
      var rescuer = null;
      for (var j = 0; j < players.length; j++) {
        var a = players[j];
        if (!a.down && a.eHeld && Math.hypot(a.x - d.x, a.y - d.y) < 28) rescuer = a;
      }
      if (rescuer) {
        d.revive += dt / 2.2;
        if (d.revive >= 1) {
          d.revive = 0; d.down = false; d.hp = Math.ceil(d.maxHp / 2); d.sh = d.maxSh; d.iframes = 1.5;
          this.emit(['num', R(d.x), R(d.y - 20), 'REVIVIDO', '#7aff6a']); this.emit(['sfx', 'revive']);
          this.emit(['spawn', R(d.x), R(d.y)]);
        }
      } else d.revive = Math.max(0, d.revive - dt * 0.5);
    }
  };

  // ---- waves ----
  P.makeEnemy = function (type, x, y) {
    var def = D.enemies[type], f = this.floorNum - 1;
    var hp = Math.round(def.hp * (type === 6 ? 1 + 0.45 * f : 1 + 0.28 * f) * (1 + 0.35 * (this.plist().length - 1)));
    return {
      id: this.nextId++, type: type, x: x, y: y, kx: 0, ky: 0, hp: hp, maxHp: hp, r: def.r, spawnT: 0.9, flash: 0,
      cd: G.rand(0.6, 1.6), st: 0, stT: 0, ang: 0, touch: 0, face: 1, tele: false, rot: G.rand(0, 6), ph: 0, pt: 4, sm: 0, t: G.rand(0, 10), dead: false, dir: Math.random() < 0.5 ? 1 : -1, hx: 0, hy: 0
    };
  };
  P.spawnPoint = function (minDist) {
    var w = this.world, alive = this.plist(), best = null;
    for (var i = 0; i < 40; i++) {
      var tx = G.randi(3, w.cols - 4), ty = G.randi(3, w.rows - 4), x = tx * T + 8, y = ty * T + 8;
      if (w.grid[ty * w.cols + tx] !== 0) continue;
      var ok = true;
      for (var j = 0; j < alive.length; j++) if (Math.hypot(alive[j].x - x, alive[j].y - y) < minDist) { ok = false; break; }
      if (ok) return { x: x, y: y };
      best = { x: x, y: y };
    }
    return best || { x: w.pw / 2, y: w.ph / 2 };
  };
  P.spawnWave = function (room) {
    var list = [], i, pt;
    if (room.type === 'boss') {
      var b = this.makeEnemy(6, this.world.pw / 2, this.world.ph / 2 - 30); b.spawnT = 1.4; this.enemies.push(b);
      this.emit(['banner', D.bossNames[(this.floorNum - 1) % 3].toUpperCase()]);
      this.emit(['spawn', R(b.x), R(b.y)]); return;
    }
    var n = Math.min(10, 2 + this.floorNum + G.randi(0, 2) + (this.plist().length - 1));
    var early = this.floorNum < 2, wt = [[0, 4], [1, 3], [4, 2], [2, early ? 1 : 2], [3, early ? 1 : 2]], tot = 0;
    wt.forEach(function (x) { tot += x[1]; });
    for (i = 0; i < n; i++) {
      var r = Math.random() * tot, type = 0;
      for (var k = 0; k < wt.length; k++) { r -= wt[k][1]; if (r <= 0) { type = wt[k][0]; break; } }
      pt = this.spawnPoint(110);
      var e = this.makeEnemy(type, pt.x, pt.y); this.enemies.push(e); this.emit(['spawn', R(e.x), R(e.y)]);
    }
  };
  P.stepWaves = function (dt) {
    var room = this.room;
    if (this.enemies.length === 0 && this.spawnQ.length === 0) {
      room.waveT -= dt;
      if (room.waveT <= 0) {
        if (room.wavesLeft > 0) { room.wavesLeft--; this.spawnWave(room); room.waveT = 0.9; }
        else this.clearRoom();
      }
    } else room.waveT = 0.9;
  };
  P.clearRoom = function () {
    var room = this.room, w = this.world, cx = w.pw / 2, cy = w.ph / 2, i;
    room.state = 2; w.locked = false; this.stats.rooms++;
    this.emit(['sfx', 'door']);
    this.emit(['banner', room.type === 'boss' ? 'CHEFE DERROTADO!' : 'SALA LIMPA!']);
    var nc = G.randi(3, 6);
    for (i = 0; i < nc; i++) this.drop(PK.COIN, cx + G.rand(-20, 20), cy + G.rand(-12, 12));
    for (i = 0; i < G.randi(1, 2); i++) this.drop(PK.ENERGY, cx + G.rand(-20, 20), cy + G.rand(-12, 12));
    if (Math.random() < 0.35) this.drop(PK.HEART, cx, cy);
    if (room.type === 'boss') {
      this.pickups.push(this.mkPickup(PK.PORTAL, cx, cy - 20));
      this.emit(['sfx', 'portal']);
    }
  };

  // ---- enemies ----
  P.nearest = function (e) {
    var best = null, bd = 1e9, pl = this.plist();
    for (var i = 0; i < pl.length; i++) {
      if (pl[i].down) continue;
      var d = Math.hypot(pl[i].x - e.x, pl[i].y - e.y);
      if (d < bd) { bd = d; best = pl[i]; }
    }
    return best;
  };
  P.moveEnemy = function (e, vx, vy, dt) {
    var k = Math.min(1, dt * 7); e.kx -= e.kx * k; e.ky -= e.ky * k;
    return E.moveBox(e, (vx + e.kx) * dt, (vy + e.ky) * dt, this.world, e.r - 2);
  };

  P.ai = function (e, dt) {
    var def = D.enemies[e.type], tgt = this.nearest(e), dx = 0, dy = 0, dist = 9999, ang = 0, vx = 0, vy = 0, i;
    if (tgt) { dx = tgt.x - e.x; dy = tgt.y - e.y; dist = Math.hypot(dx, dy); ang = Math.atan2(dy, dx); e.face = dx < 0 ? -1 : 1; }
    var sp = def.speed * (1 + 0.04 * (this.floorNum - 1)), ca = Math.cos(ang), sa = Math.sin(ang);
    e.cd -= dt;
    switch (def.id) {
      case 'grunt':
        if (tgt) { var wob = 0.85 + 0.15 * Math.sin(e.t * 3); vx = ca * sp * wob; vy = sa * sp * wob; }
        break;
      case 'archer':
        if (tgt) {
          if (dist < 75) { vx = -ca * sp; vy = -sa * sp; }
          else if (dist > 120) { vx = ca * sp; vy = sa * sp; }
          else { vx = -sa * sp * 0.6 * e.dir; vy = ca * sp * 0.6 * e.dir; }
          if (e.cd <= 0 && dist < 240) {
            e.cd = G.rand(1.3, 1.9); e.dir = Math.random() < 0.5 ? 1 : -1;
            this.ebullet(e.x, e.y, ang + G.rand(-0.06, 0.06), 105, 5); this.emit(['sfx', 'eshoot']);
          }
        }
        break;
      case 'charger':
        e.stT += dt;
        if (e.st === 0) {
          if (tgt) { vx = ca * sp; vy = sa * sp; }
          if (e.stT > 1.4 && dist < 220) { e.st = 1; e.stT = 0; e.tele = true; e.ang = ang; }
        } else if (e.st === 1) {
          if (tgt) e.ang = ang;
          if (e.stT > 0.55) { e.st = 2; e.stT = 0; e.tele = false; }
        } else if (e.st === 2) {
          vx = Math.cos(e.ang) * 200; vy = Math.sin(e.ang) * 200;
          if (e.stT > 0.7 || this.moveEnemy(e, vx, vy, dt)) {
            if (e.stT <= 0.7) this.emit(['spark', R(e.x), R(e.y), '#ffffff', 6]);
            e.st = 3; e.stT = 0;
          }
          return;
        } else if (e.stT > 0.9) { e.st = 0; e.stT = 0; }
        break;
      case 'caster':
        if (tgt) {
          if (dist < 85) { vx = -ca * sp; vy = -sa * sp; } else if (dist > 130) { vx = ca * sp; vy = sa * sp; }
          else { vx = -sa * sp * 0.5 * e.dir; vy = ca * sp * 0.5 * e.dir; }
          e.tele = e.cd < 0.45 && e.cd > 0;
          if (e.cd <= 0 && dist < 260) {
            e.cd = 2.5; e.dir = Math.random() < 0.5 ? 1 : -1; e.tele = false;
            var o = G.rand(0, 6.283);
            for (i = 0; i < 8; i++) this.ebullet(e.x, e.y, o + i * 0.7854, 72, 6);
            this.emit(['sfx', 'eshoot']);
          }
        }
        break;
      case 'slime': case 'mini':
        e.stT += dt;
        if (e.st === 0) { if (e.stT > (def.id === 'mini' ? 0.35 : 0.6)) { e.st = 1; e.stT = 0; e.hx = ca; e.hy = sa; } }
        else if (e.stT > 0.4) { e.st = 0; e.stT = 0; }
        else if (tgt) { vx = e.hx * sp * 1.3; vy = e.hy * sp * 1.3; }
        break;
      case 'boss':
        e.pt -= dt;
        if (tgt) { var bs = sp * (e.hp / e.maxHp < 0.5 ? 1.5 : 1); vx = ca * bs; vy = sa * bs; }
        var spd = 1 + 0.07 * (this.floorNum - 1);
        if (e.cd <= 0) {
          if (e.ph === 0) {
            e.cd = 1.0; for (i = 0; i < 14; i++) this.ebullet(e.x, e.y, e.rot + i / 14 * 6.283, 70 * spd, 6);
            e.rot += 0.22; this.emit(['sfx', 'eshoot']);
          } else if (e.ph === 1) {
            e.cd = 0.7; if (tgt) for (var kk = -2; kk <= 2; kk++) this.ebullet(e.x, e.y, ang + kk * 0.22, 105 * spd, 7);
            this.emit(['sfx', 'eshoot']);
          } else {
            e.cd = 0.07; e.rot += 0.35;
            this.ebullet(e.x, e.y, e.rot, 85 * spd, 5); this.ebullet(e.x, e.y, e.rot + Math.PI, 85 * spd, 5);
          }
        }
        if (e.pt <= 0) { e.ph = (e.ph + 1) % 3; e.pt = e.ph === 2 ? 3.2 : 4.5; e.cd = 0.9; }
        var fr = e.hp / e.maxHp;
        if ((fr < 0.66 && e.sm < 1) || (fr < 0.33 && e.sm < 2)) {
          e.sm++;
          for (i = 0; i < 2; i++) { var g = this.makeEnemy(0, e.x + (i ? 24 : -24), e.y + 10); this.spawnQ.push(g); this.emit(['spawn', R(g.x), R(g.y)]); }
        }
        e.tele = e.cd < 0.35 && e.ph !== 2;
        break;
    }
    this.moveEnemy(e, vx, vy, dt);
  };

  P.stepEnemies = function (dt) {
    var es = this.enemies, i, j, e, pls = this.alive(), tdm = D.enemies;
    for (i = 0; i < es.length; i++) {
      e = es[i]; if (e.dead) continue;
      e.t += dt; if (e.flash > 0) e.flash -= dt; if (e.touch > 0) e.touch -= dt;
      if (e.spawnT > 0) { e.spawnT -= dt; continue; }
      this.ai(e, dt);
      if (e.touch <= 0) {
        for (j = 0; j < pls.length; j++) {
          var p = pls[j];
          if (p.iframes <= 0 && Math.hypot(p.x - e.x, p.y - e.y) < e.r + 5) {
            this.hurtPlayer(p, tdm[e.type].touch + (this.floorNum >= 4 ? 1 : 0)); e.touch = 0.9; break;
          }
        }
      }
    }
    for (i = 0; i < es.length; i++) for (j = i + 1; j < es.length; j++) {
      var a = es[i], b = es[j]; if (a.spawnT > 0 || b.spawnT > 0 || a.dead || b.dead) continue;
      var dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r - 2;
      if (d < m && d > 0.01) {
        var push = (m - d) * 0.5 / d;
        if (a.type !== 6) E.moveBox(a, -dx * push, -dy * push, this.world, a.r - 2);
        if (b.type !== 6) E.moveBox(b, dx * push, dy * push, this.world, b.r - 2);
      }
    }
    if (this.spawnQ.length) { this.enemies = es.concat(this.spawnQ); this.spawnQ = []; es = this.enemies; }
    this.enemies = es.filter(function (x) { return !x.dead; });
  };

  P.stepBullets = function (dt) {
    var bs = this.bullets, w = this.world, i, j, b, pls = this.alive();
    for (i = 0; i < bs.length; i++) {
      b = bs[i]; if (b.dead) continue;
      b.life -= dt; if (b.life <= 0) { b.dead = true; continue; }
      var nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
      var tile = w.tileAt(nx, ny), solid = w.solidAt(nx, ny);
      if (solid) {
        if (tile === 3 && b.team === 'p') { this.breakCrate(Math.floor(nx / T), Math.floor(ny / T)); b.dead = true; continue; }
        if (b.bounce > 0) {
          if (w.solidAt(nx, b.y)) b.vx = -b.vx;
          if (w.solidAt(b.x, ny)) b.vy = -b.vy;
          if (!w.solidAt(nx, b.y) && !w.solidAt(b.x, ny)) { b.vx = -b.vx; b.vy = -b.vy; }
          b.bounce--; this.emit(['spark', R(b.x), R(b.y), D.bullets[b.style].col, 3]); continue;
        }
        b.dead = true; this.emit(['spark', R(nx), R(ny), D.bullets[b.style].col, 3]); continue;
      }
      b.x = nx; b.y = ny;
      if (b.team === 'p') {
        for (j = 0; j < this.enemies.length; j++) {
          var e = this.enemies[j];
          if (e.dead || e.spawnT > 0 || b.hit.indexOf(e.id) >= 0) continue;
          if (Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) {
            b.hit.push(e.id);
            this.hurtEnemy(e, b.dmg, Math.atan2(b.vy, b.vx), D.weapons[0].kb, G.session.players[b.owner]);
            if (b.pierce > 0) b.pierce--; else { b.dead = true; this.emit(['spark', R(b.x), R(b.y), D.bullets[b.style].col, 3]); break; }
          }
        }
      } else {
        for (j = 0; j < pls.length; j++) {
          var p = pls[j];
          if (p.iframes <= 0 && Math.hypot(p.x - b.x, p.y - b.y) < b.r + 4) { this.hurtPlayer(p, b.dmg); b.dead = true; break; }
        }
      }
    }
    this.bullets = bs.filter(function (x) { return !x.dead; });
  };

  // ---- pickups / interaction ----
  P.collect = function (p, k) {
    if (k.k === PK.COIN) { p.coins++; this.stats.coins++; this.emit(['sfx', 'coin']); return true; }
    if (k.k === PK.ENERGY) {
      if (p.en >= p.maxEn) return false;
      p.en = Math.min(p.maxEn, p.en + 25); this.emit(['sfx', 'pickup']); this.emit(['num', R(p.x), R(p.y - 16), '+EN', '#5ac8ff']); return true;
    }
    if (k.k === PK.HEART) {
      if (p.hp >= p.maxHp) return false;
      p.hp = Math.min(p.maxHp, p.hp + 2); this.emit(['sfx', 'pickup']); this.emit(['num', R(p.x), R(p.y - 16), '+HP', '#ff6a8a']); return true;
    }
    return false;
  };
  P.stepPickups = function (dt) {
    var w = this.world, pls = this.alive(), i, j;
    for (i = 0; i < this.pickups.length; i++) {
      var k = this.pickups[i]; k.t += dt;
      if (k.vx || k.vy) {
        var nx = k.x + k.vx * dt, ny = k.y + k.vy * dt;
        if (!w.solidAt(nx, ny)) { k.x = nx; k.y = ny; } else { k.vx = k.vy = 0; }
        var f = Math.max(0, 1 - 5 * dt); k.vx *= f; k.vy *= f;
        if (Math.abs(k.vx) < 2 && Math.abs(k.vy) < 2) k.vx = k.vy = 0;
      }
      if (k.k <= PK.HEART && k.t > 0.35) {
        var best = null, bd = 58;
        for (j = 0; j < pls.length; j++) { var d = Math.hypot(pls[j].x - k.x, pls[j].y - k.y); if (d < bd) { bd = d; best = pls[j]; } }
        if (best) {
          if (bd < 10) { if (this.collect(best, k)) k.dead = true; }
          else { var an = Math.atan2(best.y - k.y, best.x - k.x); k.x += Math.cos(an) * 160 * dt; k.y += Math.sin(an) * 160 * dt; }
        }
      }
    }
    this.pickups = this.pickups.filter(function (x) { return !x.dead; });
    if (this.room) this.room.pk = this.pickups;
  };

  P.nearInteract = function (p) {
    var best = null, bd = 26;
    for (var i = 0; i < this.pickups.length; i++) {
      var k = this.pickups[i]; if (k.k < PK.WEAPON) continue;
      var d = Math.hypot(k.x - p.x, k.y - p.y);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  };
  P.interact = function (p) {
    var k = this.nearInteract(p); if (!k) return;
    if (k.k === PK.CHEST) {
      k.dead = true; this.emit(['boom', R(k.x), R(k.y), '#ffd84a', 3]);
      var wp = this.drop(PK.WEAPON, k.x, k.y + 8, this.randWeapon()); wp.vx = wp.vy = 0;
      if (Math.random() < 0.6) for (var i = 0; i < 4; i++) this.drop(PK.COIN, k.x, k.y);
    } else if (k.k === PK.WEAPON) {
      var old;
      if (p.weapons[1] < 0) { p.weapons[1] = k.a; p.cur = 1; }
      else { old = p.weapons[p.cur]; p.weapons[p.cur] = k.a; var dr = this.drop(PK.WEAPON, p.x, p.y + 8, old); dr.vx = dr.vy = 0; dr.t = -0.5; }
      k.dead = true; this.emit(['sfx', 'pickup']);
      this.emit(['num', R(p.x), R(p.y - 18), D.weapons[k.a].name.toUpperCase(), '#ffd84a']);
    } else if (k.k === PK.SHOP) {
      var price = k.b;
      if (p.coins < price) { this.emit(['num', R(p.x), R(p.y - 18), 'SEM MOEDAS', '#ff8a8a']); this.emit(['sfx', 'empty']); return; }
      if (k.a === 0 && p.hp >= p.maxHp) { this.emit(['num', R(p.x), R(p.y - 18), 'VIDA CHEIA', '#ff8a8a']); return; }
      if (k.a === 1 && p.en >= p.maxEn) { this.emit(['num', R(p.x), R(p.y - 18), 'ENERGIA CHEIA', '#ff8a8a']); return; }
      p.coins -= price; k.dead = true; this.emit(['sfx', 'buy']);
      if (k.a === 0) { p.hp = Math.min(p.maxHp, p.hp + 4); this.emit(['num', R(p.x), R(p.y - 18), '+HP', '#ff6a8a']); }
      else if (k.a === 1) { p.en = p.maxEn; this.emit(['num', R(p.x), R(p.y - 18), '+EN', '#5ac8ff']); }
      else { var d2 = this.drop(PK.WEAPON, p.x, p.y + 8, k.c); d2.vx = d2.vy = 0; d2.t = -0.5; }
    } else if (k.k === PK.PORTAL) {
      this.nextFloor();
    }
  };

  P.checkDoors = function (players) {
    var w = this.world;
    if (w.locked) return;
    for (var i = 0; i < players.length; i++) {
      var p = players[i]; if (p.down) continue;
      if (w.tileAt(p.x, p.y) === 4) {
        var side = G.dungeon.doorSide(w, Math.floor(p.x / T), Math.floor(p.y / T));
        var nid = this.room.links[side];
        if (nid !== undefined) {
          this.enterRoom(this.dun.rooms[nid], OPP[side]); this.emit(['sfx', 'door']); return;
        }
      }
    }
  };

  // ---------- snapshots ----------
  P.serialize = function () {
    var ps = [], room = this.room, i, r1 = function (v) { return Math.round(v * 10) / 10; };
    this.plist().forEach(function (p) {
      ps.push([p.slot, R(p.x), R(p.y), +p.aim.toFixed(2), p.hp, p.maxHp, p.sh, p.maxSh, Math.round(p.en), p.maxEn, p.coins, p.weapons[0], p.weapons[1], p.cur,
        (p.down ? 1 : 0) | (p.dashT > 0 ? 2 : 0) | (p.moving ? 4 : 0) | (p.firing ? 8 : 0) | (p.iframes > 0 ? 16 : 0), Math.round(p.revive * 100)]);
    });
    var es = this.enemies.map(function (e) {
      return [e.id, e.type, R(e.x), R(e.y), Math.ceil(e.hp), e.maxHp, (e.flash > 0 ? 1 : 0) | (e.spawnT > 0 ? 2 : 0) | (e.tele ? 4 : 0) | (e.face < 0 ? 8 : 0)];
    });
    var bs = this.bullets.map(function (b) { return [b.id, r1(b.x), r1(b.y), R(b.vx), R(b.vy), b.style]; });
    var ks = this.pickups.map(function (k) { return [k.id, k.k, R(k.x), R(k.y), k.a, k.b, k.c]; });
    var vis = this.dun.rooms.map(function (r) { return (r.visited ? 1 : 0) | (r.state === 2 ? 2 : 0); });
    var s = { fl: this.floorNum, r: room.id, q: this.rseq, sd: this.entrySide, lk: this.world.locked ? 1 : 0, p: ps, e: es, b: bs, k: ks, br: room.broken, vis: vis, ev: this.events };
    this.events = [];
    return s;
  };

  P.syncMap = function (map, arr, mk, upd) {
    var now = performance.now(), seen = {}, out = [], i;
    for (i = 0; i < arr.length; i++) {
      var a = arr[i], o = map.get(a[0]);
      if (!o) { o = mk(a); o.ib = new G.Interp(); map.set(a[0], o); }
      upd(o, a); o.ib.push(now, o.x, o.y); seen[a[0]] = 1; out.push(o);
    }
    map.forEach(function (v, id) { if (!seen[id]) map.delete(id); });
    return out;
  };

  P.applySnapshot = function (s) {
    var ses = G.session, now = performance.now(), self = this, i;
    if (s.fl !== this.floorNum) { this.loadFloor(s.fl); this.room = null; }
    var room = this.dun.rooms[s.r];
    if (!room) return;
    if (room !== this.room || s.q !== this.rseq) {
      this.room = room; this.world = this.getWorld(room); this.rseq = s.q; ses.rseq = s.q; this.entrySide = s.sd;
      this.placePlayers(s.sd || null);
      this.eMap.clear(); this.bMap.clear(); this.kMap.clear();
      this.fade = 0.4;
      G.cam.follow(this.world, this.local().x, this.local().y, 0, true);
    }
    this.world.locked = !!s.lk;
    for (i = 0; i < s.br.length; i++) {
      var idx = s.br[i];
      if (this.world.grid[idx] === 3) { this.world.grid[idx] = 0; this.fx(['crate', (idx % this.world.cols) * T + 8, Math.floor(idx / this.world.cols) * T + 8]); }
    }
    for (i = 0; i < s.vis.length; i++) { var r = this.dun.rooms[i]; r.visited = !!(s.vis[i] & 1); r.state = (s.vis[i] & 2) ? 2 : (r.visited ? 1 : null); }
    s.p.forEach(function (a) {
      var p = ses.players[a[0]]; if (!p) return;
      p.hp = a[4]; p.maxHp = a[5]; p.sh = a[6]; p.maxSh = a[7]; p.en = a[8]; p.maxEn = a[9]; p.coins = a[10];
      p.weapons = [a[11], a[12]]; p.cur = a[13];
      var fl = a[14]; p.down = !!(fl & 1); p.iframes = (fl & 16) ? 0.1 : 0; p.revive = a[15] / 100;
      if (!p.local) { p.aim = a[3]; p.moving = !!(fl & 4); p.firing = !!(fl & 8); p.x = a[1]; p.y = a[2]; p.ib.push(now, a[1], a[2]); }
    });
    this.enemies = this.syncMap(this.eMap, s.e, function (a) {
      return { id: a[0], type: a[1], x: a[2], y: a[3], r: D.enemies[a[1]].r, hp: a[4], maxHp: a[5], t: Math.random() * 9, flash: 0, face: 1, spawnT: 0, tele: false };
    }, function (o, a) {
      o.x = a[2]; o.y = a[3]; o.hp = a[4]; o.maxHp = a[5]; var f = a[6];
      o.flash = (f & 1) ? 0.1 : 0; o.spawnT = (f & 2) ? 1 : 0; o.tele = !!(f & 4); o.face = (f & 8) ? -1 : 1;
    });
    this.bullets = this.syncMap(this.bMap, s.b, function (a) { return { id: a[0], x: a[1], y: a[2], vx: a[3], vy: a[4], style: a[5], r: D.bullets[a[5]].r }; },
      function (o, a) { o.x = a[1]; o.y = a[2]; o.vx = a[3]; o.vy = a[4]; });
    this.pickups = this.syncMap(this.kMap, s.k, function (a) { return { id: a[0], k: a[1], x: a[2], y: a[3], a: a[4], b: a[5], c: a[6], t: Math.random() * 6 }; },
      function (o, a) { o.x = a[2]; o.y = a[3]; o.a = a[4]; o.b = a[5]; o.c = a[6]; });
    for (i = 0; i < s.ev.length; i++) self.fx(s.ev[i]);
  };

  // ---------- per-frame ----------
  P.update = function (dt) {
    var lp = this.local(), i;
    this.t += dt;
    if (this.fade > 0) this.fade -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    if (lp) E.updateLocal(lp, this.world, dt);
    if (this.host) {
      this.simulate(dt);
      if (!G.net.hasClients()) this.events.length = 0;
    } else {
      this.plist().forEach(function (p) { if (!p.local) E.animate(p, dt); });
      for (i = 0; i < this.enemies.length; i++) this.enemies[i].t += dt;
      for (i = 0; i < this.pickups.length; i++) this.pickups[i].t += dt;
      // local weapon cooldown visual only
    }
    if (lp) G.cam.follow(this.world, lp.x, lp.y, dt, false);
    G.cam.update(dt);
    F.update(dt);
    this.hudT -= dt;
    if (this.hudT <= 0) { this.hudT = 0.1; this.updateHud(); }
  };

  P.updateHud = function () {
    var lp = this.local(), boss = null, hint = '', i;
    for (i = 0; i < this.enemies.length; i++) if (this.enemies[i].type === 6) boss = this.enemies[i];
    G.ui.setBoss(boss && boss.spawnT <= 0 ? D.bossNames[(this.floorNum - 1) % 3] : null, boss ? boss.hp / boss.maxHp : 0);
    if (lp && lp.down) hint = 'VOCE CAIU - ESPERE UM ALIADO SEGURAR E';
    else if (lp) {
      var near = null, pl = this.plist();
      for (i = 0; i < pl.length; i++) if (pl[i].down && Math.hypot(pl[i].x - lp.x, pl[i].y - lp.y) < 30) near = pl[i];
      if (near) hint = 'SEGURE E: REVIVER ' + near.name;
      else {
        var k = this.nearInteract(lp);
        if (k) {
          if (k.k === PK.CHEST) hint = 'E: ABRIR BAU';
          else if (k.k === PK.WEAPON) hint = 'E: PEGAR ' + D.weapons[k.a].name;
          else if (k.k === PK.PORTAL) hint = 'E: PROXIMO ANDAR';
          else if (k.k === PK.SHOP) hint = 'E: COMPRAR ' + ['CURA', 'ENERGIA', D.weapons[k.c].name][k.a] + ' (' + k.b + ' MOEDAS)';
        }
      }
    }
    G.ui.hint(hint);
    var rm = this.room, label = 'ANDAR ' + this.floorNum + '  SALA ' + (rm ? rm.id + 1 : 1) + '/' + this.dun.rooms.length;
    G.ui.updateHud({ local: lp, players: this.plist(), label: label, map: this.minimap() });
  };

  P.minimap = function () {
    var rooms = this.dun.rooms, cur = this.room, out = [];
    rooms.forEach(function (r) {
      var known = r.visited;
      if (!known) for (var k in r.links) if (rooms[r.links[k]].visited) known = true;
      out.push({ gx: r.gx, gy: r.gy, type: r.type, visited: r.visited, cleared: r.state === 2, cur: r === cur, known: known, links: r.links });
    });
    return out;
  };

  P.summary = function () {
    return { floor: this.floorNum, room: this.room ? { id: this.room.id, type: this.room.type, state: this.room.state } : null, enemies: this.enemies.length, rooms: this.dun.rooms.length, bullets: this.bullets.length, pickups: this.pickups.length };
  };

  // ---------- drawing ----------
  P.draw = function (ctx) {
    var cam = G.cam, w = this.world, th = S.tiles(w.theme), now = performance.now(), rt = now - 110, host = this.host, i, j;
    ctx.fillStyle = '#0a0710'; ctx.fillRect(0, 0, G.W, G.H);
    ctx.save();
    ctx.translate(-Math.round(cam.x + cam.sx), -Math.round(cam.y + cam.sy));
    ctx.drawImage(w.layer(), 0, -S.OY);
    S.drawTorches(ctx, w.layer(), now / 1000);
    var x0 = Math.max(0, Math.floor(cam.x / T) - 1), x1 = Math.min(w.cols - 1, Math.ceil((cam.x + G.W) / T) + 1);
    var y0 = Math.max(0, Math.floor(cam.y / T) - 1), y1 = Math.min(w.rows - 1, Math.ceil((cam.y + G.H) / T) + 1);
    for (j = y0; j <= y1; j++) for (i = x0; i <= x1; i++) {
      var c = w.grid[j * w.cols + i];
      if (c === 4 && w.locked) ctx.drawImage(th.doorShut, i * T, j * T);
    }
    // pickups
    for (i = 0; i < this.pickups.length; i++) this.drawPickup(ctx, this.pickups[i]);
    // actors sorted by y
    var acts = [];
    for (j = y0; j <= y1; j++) for (i = x0; i <= x1; i++) {
      var pc = w.grid[j * w.cols + i];
      if (pc === 2 || pc === 3) acts.push({ y: j * T + 12, prop: pc, tx: i, ty: j });
    }
    for (i = 0; i < this.enemies.length; i++) { var e = this.enemies[i]; var ep = host || !e.ib ? e : (e.ib.get(rt) || e); acts.push({ y: ep.y, e: e, p: ep }); }
    var pl = this.plist(), local = G.session.local;
    for (i = 0; i < pl.length; i++) acts.push({ y: E.renderPos(pl[i]).y, pl: pl[i] });
    acts.sort(function (a, b) { return a.y - b.y; });
    for (i = 0; i < acts.length; i++) {
      var a = acts[i];
      if (a.prop) S.drawProp(ctx, w, a.prop, a.tx, a.ty);
      else if (a.e) this.drawEnemy(ctx, a.e, a.p); else {
        E.drawPlayer(ctx, a.pl, a.pl.slot !== local);
        if (a.pl.down && a.pl.revive > 0) {
          var rp = E.renderPos(a.pl);
          ctx.fillStyle = '#000'; ctx.fillRect(Math.round(rp.x) - 9, Math.round(rp.y) - 16, 18, 4);
          ctx.fillStyle = '#7aff6a'; ctx.fillRect(Math.round(rp.x) - 8, Math.round(rp.y) - 15, Math.round(16 * a.pl.revive), 2);
        }
      }
    }
    ctx.drawImage(w.layer().over, 0, -S.OY);
    for (i = 0; i < this.bullets.length; i++) {
      var b = this.bullets[i]; var bp = host || !b.ib ? b : (b.ib.get(rt) || b);
      this.drawBullet(ctx, b, bp);
    }
    F.draw(ctx);
    S.drawTorchGlow(ctx, w.layer(), now / 1000);
    for (i = 0; i < pl.length; i++) { var gp = E.renderPos(pl[i]); if (!pl[i].down) S.glow(ctx, gp.x, gp.y, 40, '#fff0c8', 0.10); }
    for (i = 0; i < this.bullets.length; i++) {
      var gb = this.bullets[i], gbp = host || !gb.ib ? gb : (gb.ib.get(rt) || gb);
      S.glow(ctx, gbp.x, gbp.y, 9, D.bullets[gb.style].col, 0.5);
    }
    ctx.restore();
    ctx.drawImage(S.vignette(), 0, 0);
    if (this.hurtFlash > 0) { ctx.fillStyle = 'rgba(255,40,60,' + (this.hurtFlash * 0.7) + ')'; ctx.fillRect(0, 0, G.W, G.H); }
    if (this.fade > 0) { ctx.fillStyle = 'rgba(0,0,0,' + Math.min(1, this.fade * 2.5) + ')'; ctx.fillRect(0, 0, G.W, G.H); }
    if (this.banner) {
      var b2 = this.banner, al = Math.min(1, b2.t * 2.5, (b2.max - b2.t) * 4);
      ctx.globalAlpha = Math.max(0, al);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 56, G.W, 30);
      G.font.draw(ctx, b2.text, G.W / 2, 65, '#ffd84a', 3, 'c');
      ctx.globalAlpha = 1;
    }
  };

  P.drawEnemy = function (ctx, e, p) {
    var x = Math.round(p.x), y = Math.round(p.y), img = S.enemy(e.type, this.floorNum - 1), spawning = e.spawnT > 0;
    S.shadow(ctx, x, y + e.r, e.r + 1);
    if (spawning) {
      var pr = Math.floor(e.t * 14) % 2;
      ctx.globalAlpha = 0.35 + pr * 0.25;
      ctx.fillStyle = '#a070ff'; ctx.fillRect(x - e.r, y + e.r - 1, e.r * 2, 2);
    }
    if (e.flash > 0 || (e.tele && Math.floor(e.t * 14) % 2 === 0)) img = S.flash(img);
    var sq = 1 + 0.06 * Math.sin(e.t * 8) + (e.st === 1 && e.type === 4 ? 0.1 : 0);
    ctx.save(); ctx.translate(x, y + e.r + 1);
    if (e.type === 6) ctx.translate(0, Math.sin(e.t * 3) * 1.5 - 4);
    ctx.scale(e.face < 0 ? -1 : 1, e.type === 6 ? 1 : sq);
    ctx.drawImage(img, -Math.floor(img.width / 2), -img.height);
    ctx.restore();
    ctx.globalAlpha = 1;
    if (e.tele && e.type === 2) G.font.draw(ctx, '!', x, y - e.r - 12, '#ff5a5a', 2, 'c');
    if (e.hp < e.maxHp && e.type !== 6 && !spawning) {
      ctx.fillStyle = '#000'; ctx.fillRect(x - 7, y - e.r - 9, 14, 3);
      ctx.fillStyle = '#ff4a5a'; ctx.fillRect(x - 6, y - e.r - 8, Math.max(1, Math.round(12 * e.hp / e.maxHp)), 1);
    }
  };

  P.drawBullet = function (ctx, b, p) {
    var st = D.bullets[b.style], x = p.x, y = p.y, sp = Math.hypot(b.vx, b.vy) || 1, nx = b.vx / sp, ny = b.vy / sp, k;
    if (st.shape === 1) {
      ctx.fillStyle = 'rgba(90,240,255,0.35)';
      for (k = 1; k <= 5; k++) ctx.fillRect(Math.round(x - nx * k * 3 - 1), Math.round(y - ny * k * 3 - 1), 3, 3);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(x - 1), Math.round(y - 1), 3, 3);
      ctx.fillStyle = st.col; ctx.fillRect(Math.round(x - nx * 3 - 1), Math.round(y - ny * 3 - 1), 3, 3);
    } else if (st.shape === 2) {
      ctx.globalAlpha = 0.3; ctx.fillStyle = st.col;
      for (k = 1; k <= 3; k++) { var s2 = st.r * 2 - k; ctx.fillRect(Math.round(x - nx * k * 4 - s2 / 2), Math.round(y - ny * k * 4 - s2 / 2), s2, s2); }
      ctx.globalAlpha = 1;
      ctx.fillStyle = S.shade(st.col, -60); ctx.fillRect(Math.round(x - st.r), Math.round(y - st.r), st.r * 2, st.r * 2);
      ctx.fillStyle = st.col; ctx.fillRect(Math.round(x - st.r + 1), Math.round(y - st.r + 1), st.r * 2 - 2, st.r * 2 - 2);
      ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(x - 1), Math.round(y - 1), 2, 2);
    } else {
      ctx.globalAlpha = 0.4; ctx.fillStyle = st.col;
      for (k = 1; k <= 2; k++) ctx.fillRect(Math.round(x - nx * k * 3 - 1), Math.round(y - ny * k * 3 - 1), 2, 2);
      ctx.globalAlpha = 1;
      var rr = st.r;
      ctx.fillStyle = st.col; ctx.fillRect(Math.round(x - rr + 0.5), Math.round(y - rr + 0.5), rr * 2 - 1, rr * 2 - 1);
      if (rr >= 3) { ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(x - 1), Math.round(y - 1), 2, 2); }
    }
  };

  P.drawPickup = function (ctx, k) {
    var x = Math.round(k.x), y = Math.round(k.y), bob = Math.round(Math.sin(k.t * 4 + k.id) * 1.5), img, kk = k.k;
    if (kk === PK.PORTAL) {
      var t = this.t;
      for (var i = 0; i < 26; i++) {
        var an = t * 2.5 + i * 0.5, rad = 3 + i * 0.75;
        ctx.fillStyle = i % 3 === 0 ? '#ffffff' : (i % 2 ? '#a070ff' : '#5af0ff');
        ctx.fillRect(Math.round(x + Math.cos(an) * rad), Math.round(y + Math.sin(an) * rad * 0.8), 2, 2);
      }
      ctx.fillStyle = 'rgba(160,112,255,0.25)'; ctx.fillRect(x - 6, y - 5, 12, 10);
      if (Math.random() < 0.3) F.add(x + G.rand(-10, 10), y + 10, 0, -30, 0.5, '#a070ff', 1, 0, 1);
      return;
    }
    if (kk === PK.SHOP) {
      ctx.drawImage(S.pickup('pedestal'), x - 9, y + 1);
      var iy = y - 8 + bob;
      if (k.a === 0) { img = S.pickup('heart'); ctx.drawImage(img, x - 4, iy); }
      else if (k.a === 1) { img = S.pickup('energy'); ctx.drawImage(img, x - 4, iy); }
      else { var wsp = S.weapon(k.c); ctx.drawImage(wsp.c, x - (wsp.c.width >> 1), iy + 1); }
      G.font.draw(ctx, k.b + '$', x, y + 11, '#ffd84a', 1, 'c');
      return;
    }
    if (kk === PK.CHEST) { S.shadow(ctx, x, y + 8, 8); ctx.drawImage(S.pickup('chest'), x - 9, y - 8); return; }
    if (kk === PK.WEAPON) {
      var w = S.weapon(k.a);
      S.shadow(ctx, x, y + 6, 6);
      ctx.drawImage(w.c, x - (w.c.width >> 1), y - 3 + bob);
      if (Math.floor(k.t * 6) % 6 === 0) { ctx.fillStyle = '#fff'; ctx.fillRect(x + 5, y - 6 + bob, 1, 1); }
      return;
    }
    img = S.pickup(kk === PK.COIN ? 'coin' : kk === PK.ENERGY ? 'energy' : 'heart');
    S.shadow(ctx, x, y + 4, 3);
    ctx.drawImage(img, x - (img.width >> 1), y - (img.height >> 1) + bob);
  };

  G.modes.register({
    id: 'dungeon', name: 'Masmorra', description: 'Explore salas, derrote chefes e desça mais fundo.',
    create: function (ctx) {
      var m = new DM(ctx);
      return {
        enter: function () { m.enter(); },
        update: function (dt) { m.update(dt); },
        draw: function (c) { m.draw(c); },
        onNet: function () {},
        serialize: function () { return m.serialize(); },
        applySnapshot: function (s) { m.applySnapshot(s); },
        exit: function () { m.exit(); },
        summary: function () { return m.summary(); },
        raw: m
      };
    }
  });
})(window.G);
