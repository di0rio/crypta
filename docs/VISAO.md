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

### Passe de polimento gráfico — feito

- **Superfícies**: detalhe procedural no terreno (variação, estratos de rocha, musgo em encosta) e na pedra (desgaste, veios, musgo no topo).
- **Sombra de nuvem** passando pelo chão, pela grama e pelas árvores.
- **Água**: cor por profundidade, reflexo do céu, brilho do sol/lua, ondulação e espuma na margem.
- **Vegetação**: pinheiros em camadas e árvores de copa com formas orgânicas, arbustos, vento nas copas; grama com rajadas de vento, luz atravessando contra o sol, manchas secas e flores.
- **Céu**: nuvens em duas camadas iluminadas pelo sol, disco do sol, lua com relevo, estrelas e faixa da galáxia, névoa no horizonte.
- **Imagem final**: contraste, saturação, vinheta e grão; pólen flutuando de dia.
- **Personagem**: remodelado com formas torneadas — capa curta com barra ondulada, rosto, cabelo com rabo que balança, botas, braçadeiras, cinto, espada com bainha.

### Direção de arte: diorama — feito

Linguagem visual de maquete em miniatura: 3D estilizado, formas arredondadas, luz quente, foco raso. Referência só de linguagem; arte própria.

- **Câmera de maquete**: alta, teleobjetiva (FOV 30), com desfoque tilt-shift em cima e embaixo. Mouse e roda continuam orbitando e dando zoom.
- **Formas**: fim do facetado. Pinheiros torneados em camadas, copas e pedras lisas, blocos de ruína com quinas arredondadas.
- **Paleta e luz**: verdes mais suaves, pedra clara, sol quente, sombra menos preta, noite legível.
- **Chão com desenho**: trilha de terra do início até a Torre; gramado curto em tufos e campos de capim alto; flores em grupos da mesma cor; cogumelos sob as árvores.
- **Lanternas de pedra** ao longo da trilha, acesas à noite.
- **Personagem** com proporção de boneco (cabeça maior, corpo 45% maior) pra ler de longe.
- **Custo menor**: 190 mil lâminas (antes 300 mil), sombra 2048 em área menor.

### Primeiro objetivo jogável — feito

- **Brasas**: 16 luzes espalhadas por ruínas e pela trilha. Contador na tela.
- Cada brasa aumenta o fôlego máximo. Com todas, a Torre desperta.

### Verificado por simulação

Andar 6,2 m/s, correr 10,5 m/s com gasto de fôlego, pulo de 1,75 m, rolamento de 6,7 m, nado, colisão com altar, limite do mundo, encosta íngreme empurra de volta, coleta de brasa. Sem valores inválidos.

### Som e sensação — feito

- **Som procedural** (sem arquivos): vento que cresce com a velocidade, grilos à noite, passos diferentes em grama, terra e água, pulo, pouso, rolamento, braçada, acorde ao pegar brasa. Tecla M silencia.
- **Partículas**: poeira nos passos e no rolamento, anel de poeira no pouso, respingo na água, faíscas ao pegar brasa.
- **Guia**: feixe de luz sobre cada brasa e seta no chão apontando a mais próxima.
- **Progresso salvo** neste navegador (brasas, posição, hora). "Novo jogo" na tela inicial.
- **Personagem sempre visível**: árvores, pedras e ruínas entre a câmera e ele ficam vazadas.
- **Resolução adaptativa**: baixa sozinha se o quadro cair, sobe de volta quando sobra.

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
