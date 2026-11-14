# ERMO

Aventura 3D em mundo aberto, no navegador. Sem backend, sem build, sem arquivos de arte: tudo gerado em código com three.js.

## Rodar

```bash
python serve.py
```

Abrir `http://localhost:5174`. `serve.py` desliga o cache do navegador, então recarregar sempre roda o código atual. Precisa de servidor (módulos ES não abrem por `file://`) e de internet na primeira carga (three.js vem de CDN).

## Objetivo

Seguir a trilha, juntar brasas nas ruínas, vencer o que as guarda e derrubar o Colosso aos pés da Torre (ele acorda com 10 brasas).

## Controles

- WASD mover · mouse câmera · roda do mouse zoom · setas giram a câmera
- Clique ou F atacar (combo de 3) · Q ou botão direito rolar · Espaço pular · Shift correr
- Ande contra uma parede para escalar: W sobe, S desce, Espaço solta
- M som · T (segurar) acelera o tempo

## Jogar com amigos

Na tela inicial: **criar sala** mostra um código; o amigo digita o código em **entrar na sala** (ou abre o link, clicando no código durante o jogo para copiar). Para isso a pasta precisa estar hospedada em algum host estático (GitHub Pages, Vercel), ou todos na mesma máquina/rede.

## Estrutura

- `index.html`, `css/style.css` — página, tela inicial, HUD
- `game/main.js` — renderer, pós-processamento, loop
- `game/world.js` — terreno, água, árvores, pedras, ruínas, a Torre, colisão
- `game/sky.js` — céu, ciclo de dia e noite, sol/lua, névoa
- `game/grass.js` — grama e vaga-lumes na GPU
- `game/player.js` — personagem, animação procedural, controle, câmera
- `game/shade.js` — ruído e detalhe de superfície compartilhados entre shaders
- `game/quest.js` — brasas (objetivo) 
- `game/audio.js` — som procedural (WebAudio)
- `game/fx.js` — partículas
- `game/combat.js` — inimigos, orbes, golpes
- `game/boss.js` — o Colosso
- `game/net.js` — online P2P (PeerJS)
- `game/menu.js` — customização do personagem
- `game/life.js` — pássaros
- `game/noise.js` — ruído e RNG com seed
- `docs/VISAO.md` — direção do jogo e próximas etapas

Console: `ERMO.time(0.75)` muda a hora (0–1, 0.5 = meio-dia), `ERMO.go(x, z)` teleporta.
