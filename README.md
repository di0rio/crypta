# ERMO

Aventura 3D em mundo aberto, no navegador. Sem backend, sem build, sem arquivos de arte: tudo gerado em código com three.js.

## Rodar

```bash
python -m http.server 5174
```

Abrir `http://localhost:5174`. Depois de atualizar o código, recarregar com Ctrl+F5. Precisa de servidor (módulos ES não abrem por `file://`) e de internet na primeira carga (three.js vem de CDN).

## Objetivo

Seguir a trilha, explorar as ruínas e juntar as 16 brasas. Cada uma aumenta o fôlego; com todas, a Torre desperta.

## Controles

WASD mover · mouse câmera · Shift correr · Espaço pular · Q ou botão direito rolar · roda do mouse zoom · T (segurar) acelera o tempo · setas giram a câmera

## Estrutura

- `index.html`, `css/style.css` — página, tela inicial, HUD
- `src/main.js` — renderer, pós-processamento, loop
- `src/world.js` — terreno, água, árvores, pedras, ruínas, a Torre, colisão
- `src/sky.js` — céu, ciclo de dia e noite, sol/lua, névoa
- `src/grass.js` — grama e vaga-lumes na GPU
- `src/player.js` — personagem, animação procedural, controle, câmera
- `src/shade.js` — ruído e detalhe de superfície compartilhados entre shaders
- `src/quest.js` — brasas (objetivo) 
- `src/noise.js` — ruído e RNG com seed
- `docs/VISAO.md` — direção do jogo e próximas etapas

Console: `ERMO.time(0.75)` muda a hora (0–1, 0.5 = meio-dia), `ERMO.go(x, z)` teleporta.
