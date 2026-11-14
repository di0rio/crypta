(function (G) {
  'use strict';
  var D = G.data = {};

  D.palettes = {
    skin: ['#f5d0a9', '#e3a87a', '#b87848', '#7b4b2c', '#ffe3cf', '#8fd16a', '#69b4ff', '#c58cff', '#f08a8a', '#d5d5e0', '#ffd84a', '#58e0c0'],
    outfit: ['#d94a4a', '#e88a2a', '#e8c42a', '#58b848', '#2aa8a0', '#3a78d8', '#6a52d0', '#b44ac8', '#d84a98', '#4a4a5a', '#e8e8f0', '#7a4a2a'],
    accent: ['#ffd84a', '#ff8a3a', '#ff4a6a', '#7aff6a', '#4affe0', '#4aa8ff', '#a08aff', '#ff7aff', '#ffffff', '#c0c0d0', '#ffb08a', '#2a2a38']
  };
  D.bodies = ['Humano', 'Robô', 'Gato', 'Esqueleto'];
  D.heads = ['Nenhum', 'Capuz', 'Elmo', 'Chapéu de mago', 'Coroa', 'Bandana', 'Moicano', 'Chifres', 'Cartola', 'Cabelo curto', 'Cabelo longo', 'Topete'];
  D.hair = ['#3a2a22', '#7a4a2a', '#e8c060', '#d85a3a', '#1a1a24', '#e8e8f0', '#ff7ab8', '#58c8ff'];
  D.eyes = ['Pontos', 'Grandes', 'Bravo', 'Feliz', 'Brilho', 'Ciclope'];
  D.backs = ['Nenhum', 'Capa', 'Mochila', 'Asas'];

  // style: index into D.bullets
  D.weapons = [
    { id: 'pistola', name: 'Pistola', en: 0, rate: 0.26, dmg: 5, count: 1, spread: 0.04, speed: 230, life: 0.8, style: 0, kb: 30, snd: 'shoot' },
    { id: 'escopeta', name: 'Escopeta', en: 3, rate: 0.65, dmg: 3, count: 5, spread: 0.34, speed: 210, life: 0.42, style: 1, kb: 30, snd: 'shoot' },
    { id: 'metralha', name: 'Metralha', en: 1, rate: 0.085, dmg: 2.5, count: 1, spread: 0.1, speed: 270, life: 0.7, style: 2, kb: 10, snd: 'shoot' },
    { id: 'cajado', name: 'Cajado', en: 4, rate: 0.6, dmg: 9, count: 1, spread: 0, speed: 105, life: 3.2, style: 3, kb: 40, bounce: 3, pierce: 2, snd: 'laser' },
    { id: 'laser', name: 'Laser', en: 5, rate: 0.45, dmg: 7, count: 1, spread: 0, speed: 420, life: 0.55, style: 4, kb: 20, pierce: 99, snd: 'laser' },
    { id: 'espada', name: 'Espada', melee: true, en: 0, rate: 0.36, dmg: 9, range: 30, arc: 2.2, kb: 90, snd: 'swing' }
  ];
  // r: collision radius, col: color, shape: 0 dot 1 line
  D.bullets = [
    { col: '#ffe066', r: 2, shape: 0 }, { col: '#ff9a3a', r: 2, shape: 0 }, { col: '#fff3a0', r: 2, shape: 0 },
    { col: '#c07aff', r: 4, shape: 2 }, { col: '#5af0ff', r: 3, shape: 1 },
    { col: '#ff4a5a', r: 3, shape: 0 }, { col: '#ff7ad8', r: 4, shape: 2 }, { col: '#ffb040', r: 4, shape: 2 }
  ];

  // type index is used on the wire
  D.enemies = [
    { id: 'grunt', name: 'Rastejante', hp: 12, speed: 46, r: 5, touch: 1, col: '#6cc04a' },
    { id: 'archer', name: 'Arqueiro', hp: 9, speed: 38, r: 5, touch: 1, col: '#9a5ad8' },
    { id: 'charger', name: 'Investida', hp: 24, speed: 30, r: 6, touch: 2, col: '#d84a3a' },
    { id: 'caster', name: 'Conjurador', hp: 14, speed: 30, r: 5, touch: 1, col: '#4aa8e8' },
    { id: 'slime', name: 'Gosma', hp: 18, speed: 70, r: 7, touch: 1, col: '#58e0a0' },
    { id: 'mini', name: 'Gosminha', hp: 5, speed: 85, r: 4, touch: 1, col: '#ffa84a' },
    { id: 'boss', name: 'Chefe', hp: 260, speed: 22, r: 11, touch: 2, col: '#e8e0d0' }
  ];
  D.bossNames = ['Rei Crânio', 'Verme Abissal', 'Olho Ancestral'];

  // pickup kinds
  D.PK = { COIN: 0, ENERGY: 1, HEART: 2, WEAPON: 3, CHEST: 4, SHOP: 5, PORTAL: 6 };

  D.defaultChar = function () {
    return { name: 'Heroi', body: 0, skin: 0, outfit: 5, accent: 0, head: 9, eyes: 1, back: 1 };
  };
  D.randomChar = function (name) {
    var P = D.palettes;
    return {
      name: name || 'Heroi', body: G.randi(0, D.bodies.length - 1), skin: G.randi(0, P.skin.length - 1),
      outfit: G.randi(0, P.outfit.length - 1), accent: G.randi(0, P.accent.length - 1),
      head: G.randi(0, D.heads.length - 1), eyes: G.randi(0, D.eyes.length - 1), back: G.randi(0, D.backs.length - 1)
    };
  };
  D.cleanChar = function (c) {
    var d = D.defaultChar(), P = D.palettes;
    c = c || {};
    function n(v, max, def) { v = parseInt(v, 10); return (v >= 0 && v < max) ? v : def; }
    return {
      name: String(c.name || d.name).replace(/[^\w \-.À-ÿ]/g, '').slice(0, 12) || 'Heroi',
      body: n(c.body, D.bodies.length, 0), skin: n(c.skin, P.skin.length, 0), outfit: n(c.outfit, P.outfit.length, 5),
      accent: n(c.accent, P.accent.length, 0), head: n(c.head, D.heads.length, 0),
      eyes: n(c.eyes, D.eyes.length, 0), back: n(c.back, D.backs.length, 0)
    };
  };
  D.loadChar = function () {
    try { var s = localStorage.getItem('crypta.char'); if (s) return D.cleanChar(JSON.parse(s)); } catch (e) {}
    return D.defaultChar();
  };
  D.saveChar = function (c) { try { localStorage.setItem('crypta.char', JSON.stringify(c)); } catch (e) {} };
})(window.G);
