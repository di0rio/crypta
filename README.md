# CRYPTA

Jogo de ação co-op em pixel art 2.5D, no navegador, sem backend. Online P2P por código de sala (até 4).

## Rodar

```bash
python -m http.server 5173
```

Abrir `http://localhost:5173`. Também abre direto pelo `index.html`.

Pra jogar com amigos, hospedar a pasta em qualquer host estático (GitHub Pages, Vercel) e mandar o link da sala.

## Controles

WASD mover · mouse mirar · clique atirar · Espaço dash · E interagir · Q trocar arma · Esc pausa

## Estrutura

- `index.html`, `css/style.css` — página, menus e HUD
- `js/core.js` — namespace `G`, utilitários, RNG com seed
- `js/sprites.js` — toda a arte, gerada em código (personagem, tiles 2.5D, luz)
- `js/data.js` — tabelas de armas, inimigos, paletas e opções de personagem
- `js/dungeon.js`, `js/mode-dungeon.js` — geração de andares e modo masmorra
- `js/hub.js` — hub e portais; `G.modes.register(...)` é o ponto de extensão pra novos modos
- `js/net.js` — P2P (PeerJS), host autoritativo
- `docs/VISAO.md` — direção do jogo e roadmap

Debug no console: `G.debug.startSolo()`, `G.debug.startDungeon()`, `G.debug.state()`.
