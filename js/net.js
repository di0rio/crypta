(function (G) {
  'use strict';
  var PREFIX = 'crypta-room-';
  var N = G.net = {
    peer: null, role: 'solo', conns: {}, hostConn: null, code: null, max: 4,
    handlers: { message: function () {}, join: function () {}, leave: function () {}, hostLeft: function () {} }
  };
  N.available = function () { return typeof window.Peer !== 'undefined'; };
  N.hasClients = function () { return N.role === 'host' && Object.keys(N.conns).length > 0; };
  N.clientSlots = function () { return Object.keys(N.conns).map(Number); };

  N.close = function () {
    try { Object.keys(N.conns).forEach(function (s) { try { N.conns[s].close(); } catch (e) {} }); } catch (e) {}
    try { if (N.hostConn) N.hostConn.close(); } catch (e) {}
    try { if (N.peer) N.peer.destroy(); } catch (e) {}
    N.peer = null; N.conns = {}; N.hostConn = null; N.role = 'solo'; N.code = null;
  };

  function safeSend(conn, msg) { try { if (conn && conn.open) conn.send(msg); } catch (e) {} }
  N.broadcast = function (msg, exceptSlot) {
    for (var s in N.conns) if (Number(s) !== exceptSlot) safeSend(N.conns[s], msg);
  };
  N.sendTo = function (slot, msg) { safeSend(N.conns[slot], msg); };
  N.toHost = function (msg) { safeSend(N.hostConn, msg); };
  N.kick = function (slot) {
    var c = N.conns[slot]; if (!c) return;
    delete N.conns[slot];
    setTimeout(function () { try { c.close(); } catch (e) {} }, 400);
  };

  // ---- host ----
  N.host = function (onReady, onError) {
    if (!N.available()) { onError('Online indisponível (PeerJS não carregou). Jogue solo.'); return; }
    N.close();
    var attempt = 0;
    function create() {
      var code = G.roomCode(), peer;
      try { peer = new window.Peer(PREFIX + code); } catch (e) { onError('Falha ao criar sala.'); return; }
      N.peer = peer;
      var opened = false;
      peer.on('open', function () { opened = true; N.role = 'host'; N.code = code; onReady(code); });
      peer.on('error', function (err) {
        if (!opened && err.type === 'unavailable-id' && attempt++ < 5) { try { peer.destroy(); } catch (e) {} create(); return; }
        if (!opened) { onError('Erro ao criar sala (' + err.type + ').'); N.close(); }
      });
      peer.on('connection', function (conn) {
        conn.on('open', function () {
          var slot = -1;
          for (var s = 1; s < N.max; s++) if (!N.conns[s]) { slot = s; break; }
          if (slot < 0) {
            safeSend(conn, { t: 'reject', reason: 'Sala cheia (máx. 4 jogadores).' });
            setTimeout(function () { try { conn.close(); } catch (e) {} }, 400);
            return;
          }
          N.conns[slot] = conn;
          conn.on('data', function (d) { N.handlers.message(d, slot); });
          conn.on('close', function () { if (N.conns[slot] === conn) { delete N.conns[slot]; N.handlers.leave(slot); } });
          conn.on('error', function () {});
          N.handlers.join(slot);
        });
      });
      peer.on('disconnected', function () { try { peer.reconnect(); } catch (e) {} });
    }
    create();
  };

  // ---- client ----
  N.join = function (code, onOpen, onError) {
    if (!N.available()) { onError('Online indisponível (PeerJS não carregou). Jogue solo.'); return; }
    N.close();
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 5) { onError('Código inválido (5 caracteres).'); return; }
    var done = false, timer;
    function fail(msg) { if (done) return; done = true; clearTimeout(timer); N.close(); onError(msg); }
    var peer;
    try { peer = new window.Peer(); } catch (e) { fail('Falha ao iniciar conexão.'); return; }
    N.peer = peer;
    timer = setTimeout(function () { fail('Sala não encontrada (tempo esgotado).'); }, 12000);
    peer.on('error', function (err) {
      if (err.type === 'peer-unavailable') fail('Sala não encontrada.');
      else if (!done) fail('Erro de conexão (' + err.type + ').');
    });
    peer.on('open', function () {
      var conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      conn.on('open', function () {
        if (done) return;
        done = true; clearTimeout(timer);
        N.role = 'client'; N.hostConn = conn; N.code = code;
        onOpen(code);
      });
      conn.on('data', function (d) { N.handlers.message(d, 0); });
      conn.on('close', function () { if (N.hostConn === conn) { N.hostConn = null; N.handlers.hostLeft(); } else if (!done) fail('Conexão recusada.'); });
      conn.on('error', function () { fail('Erro de conexão.'); });
    });
  };
})(window.G);
