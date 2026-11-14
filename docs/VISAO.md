# ERMO — visão do jogo

Documento de direção. Registra o que foi decidido, o que está feito e a ordem do que vem.
"ERMO" é nome provisório.

## O que é

Jogo de aventura 3D em mundo aberto, terceira pessoa, no navegador.
Inspiração de **mecânica, animação e sensação**: mundo vasto e silencioso, escala, ruínas antigas, câmera pesada, movimento com peso.
A ideia, a história, o personagem e a arte são próprios — nada copiado de outro jogo.

O protótipo 2D anterior (CRYPTA, pixel art co-op) foi arquivado: está no primeiro commit do repositório.

## Restrições fixas

- Sem backend e sem build: arquivos estáticos + módulos ES. Única dependência: three.js (CDN, versão fixa 0.160.0).
- Sem arquivos de arte: terreno, céu, vegetação, ruínas e personagem são gerados em código.
- Mundo determinístico por seed: toda máquina gera o mesmo mapa (base pra online depois, sem trafegar mapa).

## Etapa 1 — feito

| Parte | O que tem |
|---|---|
| Mundo | Terreno 1600x1600 m por ruído: colinas, lagos, anel de montanhas com neve. Cor por altura e inclinação |
| Vegetação | 260 mil lâminas de grama na GPU que acompanham o jogador, balançam com vento e abrem quando ele passa. ~2600 pinheiros, 900 pedras |
| Ruínas | Círculos de pilares com lintéis, portais gigantes, altar. Um círculo e um portal perto do início, mais 9 sítios espalhados |
| Marco | A Torre: estrutura colossal com farol no topo, visível do início — um destino pra caminhar |
| Céu | Ciclo de dia e noite contínuo: sol, lua, estrelas, nuvens em movimento, amanhecer/entardecer coloridos, névoa que acompanha |
| Luz | Sol de dia e lua de noite com sombras; vaga-lumes à noite; bloom |
| Personagem | O andarilho: poncho, cachecol vermelho que voa com a velocidade, espada nas costas. Animação procedural: andar, correr, pular, cair, rolar, nadar, respirar parado |
| Controle | Câmera orbital com atraso, FOV abre na corrida, fôlego (anel), rolamento, deslizar em encosta íngreme, colisão com árvores e pilares |

## Próximas etapas

1. **Polir o personagem** — modelo com mais forma (mãos, rosto, roupa com dobra), pés que acompanham o chão (IK), transições de animação, poeira e pegadas.
2. **Agarrar e escalar** — segurar em superfícies com fôlego que esgota; escalar ruínas e a Torre.
3. **Montaria** — atravessar o mundo rápido, com inércia e animação própria.
4. **Criaturas colossais** — seres enormes e escaláveis como evento do mundo (mecânica própria, a definir).
5. **Mundo vivo** — animais, pássaros, clima (chuva, neblina, vento forte), rios e cachoeiras, biomas (deserto, neve, floresta densa).
6. **Som** — vento, passos por tipo de chão, trilha que reage à hora do dia.
7. **Customização do personagem** — cores, roupa, acessórios; cosméticos encontrados no mundo.
8. **Online com amigos** — P2P por código de sala; como o mundo é por seed, só posição/ação trafegam.
9. **Mundo maior** — terreno em chunks com nível de detalhe, sem bordas.

## Ideias de jogabilidade guardadas

- Fôlego como recurso central: correr, rolar, escalar e segurar gastam o mesmo anel.
- Destinos visíveis de longe (a Torre, luzes à noite) em vez de marcador no mapa.
- Segredos atrás de exploração vertical: topo de ruínas, cavernas, ilhas.
- Noite muda o mundo: vaga-lumes, criaturas diferentes, ruínas que acendem.
- Minigames como lugares do mundo (pesca no lago, corrida, arena).

## Pendências técnicas conhecidas

- Desempenho não medido em máquina real. Se pesar: reduzir contagem de grama, sombra e resolução.
- Terreno é uma malha única, sem nível de detalhe; mundo tem borda.
- Câmera não desvia de árvores/pilares (só do chão).
- Água é um plano simples, sem onda nem reflexo.
- Sem som. Sem salvar progresso. Sem touch/gamepad.
- Um valor inválido raro no shader da grama é descartado por proteção; a causa de origem não foi isolada.
