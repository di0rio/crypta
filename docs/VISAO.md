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

### Colisão, fluidez e juice — feito

**Colisão**
- Caixas orientadas com quina arredondada para pilares, blocos caídos e altar (antes eram círculos, e os blocos caídos não tinham colisão).
- Pedras médias e grandes agora colidem; arbustos são atravessáveis e reagem.
- Teste automático: 12.600 passos de jogo aleatório em volta de ruínas, árvores e pedras — nenhuma penetração, nenhuma queda pelo chão, nenhum valor inválido.

**Fluidez**
- Velocidade cheia em 5 quadros, inversão de direção em 7, parada em 7.
- Pulo e rolamento com buffer (apertar um pouco antes ainda conta) e tolerância ao sair de uma borda; pulo curto ao soltar cedo.
- Rolamento dirigível, cancelável em pulo, e devolve a velocidade no fim (nunca cai abaixo da de caminhada).
- Bater ou raspar em obstáculo desliza sem perder velocidade.
- Fôlego menos punitivo; câmera colada no personagem; zoom suave.

**Juice**
- Squash & stretch em mola no pulo, pouso e rolamento; tremor de câmera proporcional à queda.
- Brasa voa até o personagem; ao pegar: micro-congelamento, clarão, faíscas, acorde.
- Lanternas acendem quando ele passa, com som; arbustos farfalham e soltam folhas; árvore balança folhas na trombada.

### Jogo completo: escalada, combate, chefe, final — feito

**Arco do jogo**: seguir a trilha, juntar brasas, enfrentar o que guarda as ruínas, acordar e derrubar o Colosso aos pés da Torre.

- **Escalada**: andar contra uma parede agarra; W sobe, S desce, A/D desliza, Espaço chuta pra longe, Shift apressa. Gasta fôlego; sem fôlego, cai. Dá pra ficar em cima de blocos, pilares e lintéis. Brasas no topo dos portais pedem escalada.
- **Espada**: combo de três golpes (dois cortes e um de cima, que vale dobrado), com pequeno avanço. Clique ou F.
- **Vida**: cinco pontos. Rolar deixa intocável. Lanterna acesa cura e vira ponto de renascimento.
- **Sombras**: rondam, perseguem, avisam (incham, olhos acendem) e investem.
- **Sentinelas**: totens que disparam orbes lentos; a espada rebate o orbe de volta.
- **Luzes de cura** caem dos inimigos e voam até você.
- **O Colosso**: dorme até você ter 10 brasas. Pisão com onda de choque (pule ou role), varrida de braço, pedras arremessadas com marca no chão. Cristais nos joelhos só abrem quando a perna fica presa depois do pisão; com os dois quebrados ele ajoelha e mostra o peito. Sair da arena faz ele voltar a dormir inteiro.
- **Final**: tela de vitória com tempo, brasas, quedas e inimigos; dá pra continuar explorando.

### Personagem e amigos — feito

- **Customização**: pele, cabelo, túnica, capa, barra e cachecol por paleta; rabo de cavalo e chapéu de palha; botão aleatório. Vista ao vivo, salva no navegador.
- **Online**: criar sala gera um código de 5 letras; quem tem o código (ou o link) entra. Até 4. Cada um vê o outro com seu visual e sua animação; brasas e hora do dia são compartilhadas.
- **Pássaros** em bandos que revoam quando você chega perto.

### Verificado nesta etapa

- Escalada: 10 de 12 pilares do primeiro círculo subidos até o topo por simulação (os outros 2 têm bloco caído na frente).
- Colisão com altura: 13.600 passos aleatórios, nenhuma queda pelo chão nem valor inválido.
- Combate: inimigo morre com golpes, jogador toma dano, morre e renasce no checkpoint.
- Chefe: luta inteira simulada até a vitória (acordar, pisar, prender, ajoelhar, cair).
- Online: duas abas, entrada por código, posições e brasas sincronizando nos dois sentidos, sem erro no console.

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
