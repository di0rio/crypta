# CRYPTA — visão do jogo

Documento de direção. Registra o que foi decidido, o que está feito e a ordem do que vem.

## O que é

Jogo de ação co-op em pixel art, visão de cima em 2.5D, pra jogar com amigos pelo navegador.
Sem backend: arquivos estáticos + P2P (WebRTC via PeerJS). Cada jogador tem um personagem customizado e único.

Referência é só de **leitura visual** do gênero (pixel art chunky, colorido, arma grande, parede com altura).
Arte, personagens, nomes e fases são originais — nada copiado de outro jogo.

## Restrições fixas

- JS puro, sem build, sem dependência além do PeerJS (CDN). Abre de `file://` ou qualquer host estático.
- Sprites gerados em código (sem arquivos de imagem).
- Host autoritativo: host simula inimigos, balas, dano e loot; cliente manda só a própria posição/mira/ações.
- Rust/WASM descartado por ora: o gargalo é rede, não CPU. Reavaliar só se o render pesar (aí WebGL antes de WASM).

## Direção visual: 2.5D

Top-down com altura, ainda em canvas 2D.

| Pilar | O que é | Estado |
|---|---|---|
| Paredes com volume | Face frontal de 24px, topo iluminado, sombra de contato no chão | feito |
| Oclusão | Borda da parede sul desenhada por cima dos atores (anda-se "atrás") | feito |
| Profundidade | Pilares e caixotes com 24px de altura, ordenados por Y junto com jogadores e inimigos | feito |
| Paleta clara | Chão claro e saturado por tema, bala inimiga sempre em cor quente | feito (4 temas) |
| Tela mais próxima | Resolução interna 400x225 (antes 480x270): tudo ~20% maior | feito |
| Eixo Z falso | Dash vira pulinho com squash & stretch, sombra fica no chão | feito (só dash) |
| Personagem maior | Sprite 24–32px, contorno grosso, mais expressão | pendente |
| Eixo Z completo | Moeda quicando, granada em arco, inimigo voador, knockback com altura | pendente |
| Juice | Hit-stop, tremor direcional, cápsula caindo, crítico, marca no chão | pendente |
| Luz dinâmica | Tiro ilumina a sala, sombra projetada dos objetos, sala escurece no chefe | parcial (brilho aditivo em tochas/balas) |
| Cenário vivo | Grama que dobra, poça com reflexo, destroços com física, parede destrutível | pendente |

Alternativa guardada: WebGL com sprites em billboard e câmera inclinada. Mais bonito, bem mais caro, e complica a customização. Só se o visual virar o diferencial principal.

## Direção de jogabilidade: os três loops

1. **10 segundos — sensação.** Atirar tem que ser gostoso: recuo, impacto, inimigo reage. Dash com cancelamento, parry que devolve bala.
2. **15 minutos — a run.** A cada sala, escolhe 1 de 3 melhorias que **combinam entre si** (ricochete + fogo + fogo espalha). Armas com afixos aleatórios. Maldições: item forte com custo.
3. **Semanas — meta.** Moeda permanente desbloqueia classes, armas no pool e cosméticos. Peça rara de personagem dropa de chefe.

Extras:
- Classes com habilidade ativa e sinergia entre jogadores (um congela, outro estilhaça).
- Run diária com seed fixo, ranking entre amigos pelo link.
- Salas-evento: desafio cronometrado, aposta, NPC preso que vira vendedor.
- Minigames (pesca, arena PvP, corrida) que rendem moeda da meta.

## Mundo aberto

Ideia: trocar o hub (uma sala) por um **mundo aberto 2.5D** que é a base de tudo.

Como caberia sem backend:
- **Mundo por seed, em chunks.** Cada chunk (ex.: 32x32 tiles) é gerado de `seed + coordenada`. Todo mundo calcula o mesmo mapa; nada de mapa trafega pela rede.
- **Biomas por ruído** (floresta, deserto, neve, ruínas), cada um com paleta, inimigos e recursos próprios.
- **Masmorras viram entradas no mundo.** O modo masmorra atual continua igual, instanciado. Minigames viram lugares (lago de pesca, arena, pista).
- **Simulação por interesse.** Host simula só chunks perto de algum jogador; o resto dorme.
- **Persistência local.** Salva seed + lista de mudanças no `localStorage` do host (sem servidor, o mundo "mora" em quem hospeda).

Custos e riscos:
- Netcode fica mais difícil: jogadores espalhados = vários pedaços de mundo ativos ao mesmo tempo.
- Mundo aberto vazio é chato. Precisa de densidade de conteúdo (eventos, segredos, NPCs) — o custo real é conteúdo, não técnica.
- Sem servidor não há mundo compartilhado permanente: se o host sai, a sessão acaba.

Recomendação: fazer em fases. Primeiro um overworld pequeno e fechado no lugar do hub (prova o render 2.5D ao ar livre e a geração por chunk), só depois abrir.

## Roadmap

1. **Base 2.5D** — paredes altas, oclusão, profundidade, paleta clara. *(feito)*
2. **Personagem e inimigos novos** — sprites maiores, contorno grosso, animação com squash & stretch.
3. **Juice e eixo Z** — hit-stop, loot quicando, projéteis em arco, câmera.
4. **Overworld pequeno no lugar do hub** — chunks por seed, 2 biomas, entradas de masmorra.
5. **Sistema de build** — melhorias com sinergia, afixos de arma, maldições.
6. **Meta-progressão** — moeda permanente, desbloqueios, cosméticos por drop.
7. **Mundo aberto de verdade + minigames.**

## Pendências técnicas conhecidas

- Online só testado na mesma máquina. Sem servidor TURN: NAT restrito pode impedir a conexão.
- Cliente confia na própria posição (sem anti-cheat). Tiro do cliente só aparece após snapshot do host.
- Chefe até o fim, loja, reviver e queda do host: só passaram em teste headless, não jogados à mão.
- Balanceamento (dano, preços, ondas) é chute inicial.
- Sem suporte a touch/mobile.
- Cor do cabelo está presa ao seletor "Detalhe".
