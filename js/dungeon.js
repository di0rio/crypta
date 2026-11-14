(function (G) {
  'use strict';
  var T = 16;
  var DIRS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
  var OPP = { n: 's', s: 'n', e: 'w', w: 'e' };
  var D = G.dungeon = { DIRS: DIRS, OPP: OPP };

  // Procedural floor: rooms on a grid via random walk; tree + a few loops.
  D.generate = function (seed, floor) {
    var rng = G.rng(((seed >>> 0) * 2654435761 + floor * 40503) >>> 0);
    var n = rng.int(6, 9), cells = [{ id: 0, gx: 0, gy: 0, links: {} }], map = { '0,0': 0 }, guard = 0, i, c, k;
    var keys = ['n', 'e', 's', 'w'];
    while (cells.length < n && guard++ < 2000) {
      var base = rng.chance(0.6) ? cells[cells.length - 1] : rng.pick(cells);
      var dk = rng.pick(keys), d = DIRS[dk], gx = base.gx + d[0], gy = base.gy + d[1], key = gx + ',' + gy;
      if (map[key] !== undefined) continue;
      var nc = { id: cells.length, gx: gx, gy: gy, links: {} };
      map[key] = nc.id; cells.push(nc);
      base.links[dk] = nc.id; nc.links[OPP[dk]] = base.id;
    }
    for (i = 0; i < cells.length; i++) { // extra loops
      c = cells[i];
      ['e', 's'].forEach(function (dk2) {
        var d2 = DIRS[dk2], nk = (c.gx + d2[0]) + ',' + (c.gy + d2[1]);
        if (map[nk] !== undefined && c.links[dk2] === undefined && rng.chance(0.2)) {
          c.links[dk2] = map[nk]; cells[map[nk]].links[OPP[dk2]] = c.id;
        }
      });
    }
    function deg(r) { return Object.keys(r.links).length; }
    // BFS distance from start
    var dist = {}, q = [0]; dist[0] = 0;
    while (q.length) {
      var cur = cells[q.shift()];
      for (k in cur.links) { var nid = cur.links[k]; if (dist[nid] === undefined) { dist[nid] = dist[cur.id] + 1; q.push(nid); } }
    }
    cells[0].type = 'start';
    var order = cells.slice(1).sort(function (a, b) { return dist[b.id] - dist[a.id]; });
    var boss = null;
    for (i = 0; i < order.length; i++) if (deg(order[i]) === 1) { boss = order[i]; break; }
    if (!boss) boss = order[0];
    boss.type = 'boss';
    var rest = cells.filter(function (r) { return !r.type; });
    var leaves = rng.shuffle(rest.filter(function (r) { return deg(r) === 1; }));
    var others = rng.shuffle(rest.filter(function (r) { return deg(r) !== 1; }));
    var pool = leaves.concat(others);
    pool[0].type = 'chest'; pool[1].type = 'shop';
    cells.forEach(function (r) {
      if (!r.type) r.type = 'combat';
      r.seed = rng.int(1, 1e9);
      var big = r.type === 'combat' || r.type === 'boss';
      r.w = r.type === 'boss' ? rng.int(30, 34) : big ? rng.int(26, 32) : rng.int(22, 26);
      r.h = r.type === 'boss' ? rng.int(18, 20) : big ? rng.int(16, 19) : rng.int(13, 15);
      r.cols = r.w + 2; r.rows = r.h + 2;
      r.state = null; r.visited = false; r.world = null; r.pk = null;
    });
    return { seed: seed, floor: floor, rooms: cells, start: cells[0], boss: boss };
  };

  function makeWorld(cols, rows, theme, seedv) {
    var w = {
      cols: cols, rows: rows, pw: cols * T, ph: rows * T, grid: new Uint8Array(cols * rows),
      locked: false, theme: theme, seedv: seedv, _layer: null,
      tileAt: function (px, py) {
        var tx = Math.floor(px / T), ty = Math.floor(py / T);
        if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) return 1;
        return w.grid[ty * cols + tx];
      },
      solidAt: function (px, py) {
        var c = w.tileAt(px, py);
        return c === 1 || c === 2 || c === 3 || (c === 4 && w.locked);
      },
      layer: function () { return w._layer || (w._layer = G.sprites.roomLayer(w)); }
    };
    return w;
  }

  function doorTiles(room, dk) {
    var cols = room.cols, rows = room.rows, cx = Math.floor(cols / 2), cy = Math.floor(rows / 2);
    if (dk === 'n') return [[cx - 1, 0], [cx, 0]];
    if (dk === 's') return [[cx - 1, rows - 1], [cx, rows - 1]];
    if (dk === 'w') return [[0, cy - 1], [0, cy]];
    return [[cols - 1, cy - 1], [cols - 1, cy]];
  }

  D.buildWorld = function (room, floor) {
    var cols = room.cols, rows = room.rows, w = makeWorld(cols, rows, ((floor || 1) - 1) % 3, room.seed), g = w.grid, x, y, k;
    for (y = 0; y < rows; y++) for (x = 0; x < cols; x++) if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) g[y * cols + x] = 1;
    var doors = [];
    for (k in room.links) doorTiles(room, k).forEach(function (t) { g[t[1] * cols + t[0]] = 4; doors.push(t); });
    if (room.type === 'combat' || room.type === 'boss') {
      var rng = G.rng(room.seed), cxp = cols / 2, cyp = rows / 2;
      var free = function (tx, ty) {
        if (tx < 2 || ty < 2 || tx > cols - 3 || ty > rows - 3) return false;
        if (g[ty * cols + tx] !== 0) return false;
        for (var i = 0; i < doors.length; i++) if (Math.abs(doors[i][0] - tx) + Math.abs(doors[i][1] - ty) < 6) return false;
        if (room.type === 'boss' && Math.abs(tx - cxp) < 4 && Math.abs(ty - cyp) < 3) return false;
        return true;
      };
      var np = room.type === 'boss' ? 4 : rng.int(3, 6), i, tries;
      for (i = 0; i < np; i++) for (tries = 0; tries < 20; tries++) {
        var px = rng.int(2, cols - 3), py = rng.int(2, rows - 3);
        if (free(px, py)) { g[py * cols + px] = 2; break; }
      }
      var nc = rng.int(3, 7);
      for (i = 0; i < nc; i++) for (tries = 0; tries < 20; tries++) {
        var bx = rng.int(2, cols - 3), by = rng.int(2, rows - 3);
        if (free(bx, by)) {
          g[by * cols + bx] = 3;
          for (var j = 0; j < 2; j++) if (rng.chance(0.5)) { var ax = bx + rng.int(-1, 1), ay = by + rng.int(-1, 1); if (free(ax, ay)) g[ay * cols + ax] = 3; }
          break;
        }
      }
    }
    w.room = room; w.doors = doors;
    return w;
  };

  D.hubWorld = function () {
    var cols = 26, rows = 14, w = makeWorld(cols, rows, 3, 77), x, y;
    for (y = 0; y < rows; y++) for (x = 0; x < cols; x++) if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) w.grid[y * cols + x] = 1;
    [[5, 8], [20, 8], [5, 4], [20, 4]].forEach(function (p) { w.grid[p[1] * cols + p[0]] = 2; });
    return w;
  };

  // spawn position after crossing a door; side = side of the NEW room we arrive at (null = center)
  D.entryPos = function (room, side, slot) {
    var cols = room.cols, rows = room.rows, cx = Math.floor(cols / 2), cy = Math.floor(rows / 2), off = (slot - 1.5) * 7;
    if (!side) return { x: cols * T / 2 + off, y: rows * T / 2 };
    if (side === 's') return { x: cx * T + off, y: (rows - 1) * T - 10 };
    if (side === 'n') return { x: cx * T + off, y: T + 10 };
    if (side === 'e') return { x: (cols - 1) * T - 10, y: cy * T + off };
    return { x: T + 10, y: cy * T + off };
  };

  // which door side a tile belongs to
  D.doorSide = function (world, tx, ty) {
    if (ty === 0) return 'n';
    if (ty === world.rows - 1) return 's';
    if (tx === 0) return 'w';
    return 'e';
  };
})(window.G);
