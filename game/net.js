// Online with friends, no backend: WebRTC peer-to-peer through PeerJS (its public broker is only used to connect).
// Star topology: guests connect to the host, the host relays. Shared: where everyone is and how they look,
// the embers gathered, and the time of day. Enemies and the boss stay local to each player.

const ID = (code) => 'ermo-sala-' + code;
function makeCode() { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }

export function createNet(h) {
  let peer = null, conns = [], isHost = false, code = '', myId = '';
  const ok = () => typeof window.Peer === 'function';

  function send(msg, except) { msg.id = msg.id || myId; conns.forEach((c) => { if (c !== except && c.open) c.send(msg); }); }
  function wire(c) {
    conns.push(c);
    c.on('data', (d) => {
      if (!d || typeof d !== 'object') return;
      if (isHost) send(d, c);                                   // relay to the others, keeping the sender's id
      if (d.t === 's') h.state(d.id, d.s);
      else if (d.t === 'look') h.look(d.id, d.look);
      else if (d.t === 'ember') h.ember(d.i);
      else if (d.t === 'hello') h.hello(d);
      else if (d.t === 'time') h.time(d.v);
      else if (d.t === 'bye') h.leave(d.id);
    });
    c.on('close', () => {
      conns = conns.filter((x) => x !== c);
      if (isHost) { h.leave(c.peer); send({ t: 'bye', id: c.peer }); h.status('SALA ' + code + ' · ' + (conns.length + 1) + ' jogador' + (conns.length ? 'es' : '')); }
      else { h.leaveAll(); h.status('o anfitrião saiu'); }
    });
  }
  function fail(e) {
    const m = { 'peer-unavailable': 'sala não encontrada', 'unavailable-id': 'código em uso, tente de novo', network: 'sem conexão', 'browser-incompatible': 'navegador sem suporte' };
    h.status(m[e && e.type] || 'erro de conexão');
  }

  return {
    get active() { return !!peer; }, get code() { return code; }, get host() { return isHost; }, get peers() { return conns.length; },
    available: ok,
    host_() {
      if (!ok()) return h.status('online indisponível');
      isHost = true; code = makeCode(); peer = new window.Peer(ID(code)); h.status('criando sala…');
      peer.on('open', (id) => { myId = id; h.status('SALA ' + code + ' · 1 jogador'); });
      peer.on('connection', (c) => c.on('open', () => {
        if (conns.length >= 3) { c.close(); return; }
        wire(c); c.send({ t: 'hello', id: myId, taken: h.taken(), v: h.now() });
        h.status('SALA ' + code + ' · ' + (conns.length + 1) + ' jogadores'); h.joined();
      }));
      peer.on('error', fail);
    },
    join(c0) {
      if (!ok()) return h.status('online indisponível');
      code = String(c0 || '').toUpperCase().trim(); if (code.length < 4) return h.status('código inválido');
      isHost = false; peer = new window.Peer(); h.status('conectando…');
      peer.on('open', (id) => { myId = id; const c = peer.connect(ID(code), { reliable: true }); c.on('open', () => { wire(c); h.status('SALA ' + code + ' · conectado'); h.joined(); }); });
      peer.on('error', fail);
    },
    send
  };
}
