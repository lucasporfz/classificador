## Context

M-035 separa um beam de sorcerer em sub-linha central e lateral. O validador
(`validateBeamSublineBlock`) testa death, energy e fire e fica com o menor desvio da fração. Ele
admite os três stages em cada cast e exige dois níveis entre os hits não-overkill (as âncoras). O
leech da sub-linha usa o consenso geral: com k ≥ 4 são 2 confirmações, e 0 confirmação passa como
neutra.

A change A (`infer-sorcerer-stance-before-resolution`, 15d0db7) pôs a estância antes da resolução
e deixou o beam de fora, porque restringir o elemento sem M-035b tirava a validação dos beams de
forma A. `alumnishocks 2` 18:31:29 virava `A0 S7`.

Diagnóstico e protótipo:
- `reports/beam-subline-b-fase2.md`, com as decisões do usuário;
- `reports/beam-subline-b-fase3.md`, com os resultados;
- `reports/beam-subline-b-fase3/apply-proto-b.mjs`, que recria o protótipo numa cópia de `js/`
  fora do repo (`PROTO_DIR`).

Sessões afetadas: as que têm beam do dono do log. `alumnishocks` S0, `alumnishocks 2` S0,
`aquatic` S0–S2, `kim` S0, `death echo` S0 e `dlc ms` S0/S1 são pós-cutoff. `Mrowdy`,
`Mrowdy 2` e `ms boss` são pré-cutoff, e nenhum beam delas valida.

## Goals / Non-Goals

**Goals:**
- O elemento do beam pela ordem da máquina de M-043.
- O stage da Beam Mastery como setup da sessão.
- M-035b: central só em overkill, provado pelo leech. Inclui o nível de todo overkill provado, o
  piso e o N com hit virtual.
- Leech esparso na sub-linha.
- Nenhuma contagem A/S muda, e nenhum beam hoje validado perde validação, exceto o 18:31:58
  (forma E, alvo).

**Non-Goals:**
- Os carimbos órfãos que a B não alcança: `kim` 16:14:08, 16:18:55, 16:23:43 e 16:25:31, e
  `alumnishocks 2` 18:24:35. Nos hits com dano os rótulos estão certos, mas um dodge de dano 0 na
  janela não cabe em sub-linha nenhuma; é provavelmente o AA (V-018a, change C).
- A 2ª linha de mana do AA de mage e o "mana on kill" (change C).
- A spell que atravessa o bloco provisório de 2 s (change D).
- Fazer o teste do turno inteiro (linha ~340 de `unified-turn-resolution.js`) enxergar hits
  virtuais. Medido: 3 turnos perdem o motivo `ms_beam_subline_validated_no_a1` por isso
  (`dlc ms` S0 21:37:37, S1 21:54:37 e `kim` 16:25:08) e continuam A0 pelo default, com a mesma
  contagem.
- A ambiguidade de como o bônus por alvo é contado (M-035); as duas leituras continuam.

## Turn stories

Todos os turnos continuam com a contagem de hoje. A história diz o que muda no beam.

1. Como `alumnishocks 2` S0 21/Sep/2026 18:30:18, quero ser `A1 S4` com o beam em **energy**,
   stage 1, com `1320` central e `389`, `389`, `121 OK` laterais. O cast está `arm` e o elemento
   vem da estância (M-043).
2. Como `aquatic` S2 31/Aug/2026 13:05:51, quero ser `A0 S9` com o beam em **energy**, stage 3,
   com `763 OK`, `4394`, `4394` centrais e `3077×2`, `2376 OK`, `2509`, `2606×2` laterais. O
   `763 OK` tem o leech dos centrais (M-035b, nível do dano real).
3. Como `death echo` S0 10/Jul/2026 11:06:22, quero ser `A1 S8` com o beam em **death**, com os
   rótulos de hoje (`504 OK`, `1700`, `1805` centrais). O cast está `rearm` na estância death.
4. Como `dlc ms` S1 17/Jul/2026 21:52:46, quero ser `A0 S5` com o beam em **fire**, com os rótulos
   de hoje. O cast está `converted` e a estância vem primeiro.
5. Como `alumnishocks 2` S0 18:26:16, quero ser `A1 S6` com o beam em energy, stage 1, com
   `175 OK` central e `91 OK`, `653×2`, `684×2` laterais (M-035b, forma A; vida e mana concordam).
6. Como `alumnishocks 2` S0 18:31:29, quero ser `A1 S6` com `1560 OK` e `1622 OK` centrais e
   `466`, `445`, `466`, `445` laterais (M-035b; o A1 vem do sufixo que valida o beam).
7. Como `alumnishocks 2` S0 18:31:42, quero ser `A1 S4` com `1334 OK` central e `480`, `436×2`
   laterais (M-035b; mana com a reserva que não encheu).
8. Como `alumnishocks 2` S0 18:31:58, quero ser `A1 S4` **sem sub-linha**: os quatro hits estão no
   mesmo nível e o `361 OK` tem o leech dos `537`.
9. Como `alumnishocks 2` S0 18:22:39, quero ser `A1 S6` com `2015 OK`, `311 OK`, `2745 OK`
   centrais e `803`, `739 OK`, `803` laterais (forma A, stage 1, fração 0,25).
10. Como `alumnishocks 2` S0 18:25:16, quero ser `A1 S10` com `1656`, `20 OK`, `1156 OK`
    centrais e `434`, `396×3`, `145 OK`, `94 OK`, `235 OK` laterais (nível do dano real).
11. Como `alumnishocks 2` S0 18:25:35, quero ser `A1 S5` com `1520 OK` central e `506×2`, `531`,
    `484` laterais (forma A).
12. Como `alumnishocks 2` S0 18:27:45, quero ser `A1 S6` com `20 OK`, `1185 OK` centrais e `474`,
    `452×3` laterais (forma A).
13. Como `alumnishocks 2` S0 18:28:09, quero ser `A1 S6` com `1591 OK` central e `557×2`, `507`,
    `530×2` laterais (forma A; mana com a reserva que não encheu).
14. Como `alumnishocks 2` S0 18:30:11, quero ser `A1 S3` com `1252 OK` central e `488×2`
    laterais (forma A).
15. Como `alumnishocks 2` S0 18:31:14, quero ser `A1 S6` com `1067 OK` central e `452×2`, `431×3`
    laterais (forma A).
16. Como `dlc ms` S0 17/Jul/2026 21:44:27, quero ser `A0 S6` com o beam em **fire**, stage 3,
    fração 0,8721, `2420` central e `2111×2`, `2856`, `2865×2` laterais (leech esparso).
17. Como `aquatic` S0 31/Aug/2026 10:44:32, quero ser `A0 S7` com o `588 OK` central: a mana dele
    é a do central `raider 3004` (M-035b).

Guardas, fotografia de hoje decidida pelo usuário:
- `kim` S0 16:15:56 continua `A0 S7` sem sub-linha, porque o `323 OK` não tem dano real provado;
- `Mrowdy 2` S0 e `ms boss` S14 17:16:37 continuam `A1 S5` sem sub-linha.

## Decisions

### D1. Elemento do beam pela máquina, com o 2º elemento só como último recurso

`validateBeamSublineBlock` passa a iterar os elementos que `sorcererSpellElementCandidates` devolve,
na ordem da máquina, e para no primeiro que tem alguma distribuição válida. Só as distribuições
desse elemento entram na unanimidade que decide o rótulo.

- Sem candidatos com estância `not_applicable`: só o nativo.
- Sem setup de estância (contexto montado à mão): o comportamento de hoje, delta primeiro.
- Estância desconhecida: os três elementos, com spread primeiro e perfil no empate.

`sorcererSpellElement` passa a devolver, para beam, o 1º elemento da máquina, e é esse o elemento
do bloco genérico quando o validador de beam não fecha.

*Alternativa descartada, medida na change A:* restringir o elemento sem M-035b. Tira a validação
de 4 beams e muda 18:31:29 para `A0 S7`.

### D2. Stage da sessão como campo do SessionSetup

`beamMasteryStage` entra em `SETUP_FIELDS` e, com isso, na impressão digital dos caches C1/C3.
`inferBeamMasteryStageFromResolved` lê, na passada sem leech (ou `pass1`), o `beamValidStages` dos
blocos finais que validam, e crava por unanimidade dos discriminantes. Roda antes da passada final,
no mesmo ponto do eixo de AA e do pierce da arma.

- *Medido:* unânime nas 9 sessões pós-cutoff (Alumni Shocks = 1, resto = 3).
- *Medido:* desligar o stage não muda **nenhum** turno, porque com o elemento restrito cada beam já
  só fecha num stage.
- Fica porque o stage é um fato do personagem, por decisão do usuário, e barra um stage por
  coincidência nos logs futuros.

*Alternativa:* uma passada extra de resolução, como o tier do Executioner em M-034b. Não é
necessária, porque a passada sem leech já existe.

### D3. M-035b: prova do dano real (vida e mana concordam, ou a reserva não encheu)

A prova de um overkill é uma de duas:
- os intervalos de dano real de vida e de mana se cruzam (com a tolerância de leech de D-024);
- ou um canal cujos hits seguintes do golpe **todos** ganham o recurso, sem perda dele no meio.

Para a perda no meio, o parser passa a anotar em cada evento quantas linhas
`You lose N hitpoints` e `You lose N mana` vieram antes, no molde do `barrierEpoch` de D-011a.

- *Medido:* com só a primeira prova, 18:31:42, 18:27:45 e 18:28:09 ficam vermelhos.
- *Medido:* com "algum hit seguinte ganha", em vez de "todos ganham", `kim` 16:15:56 ganharia um
  central `{323 OK, …}` com fração ≈ 0,774 contra 0,7766.
- *Medido:* a trava de perda de recurso não muda nenhum turno do corpus, mas o cenário existe (61
  perdas de vida entre hits do mesmo segundo em `alumnishocks 2`).

### D4. Forma A, nível e piso

O nível e o piso só comparam overkill e âncora do mesmo estado de crítico. O N admite `+0` até
`+k` hits virtuais de charm-kill do bloco.

- **Forma A:** as âncoras formam um cluster só e, então, são todas laterais. O central é a
  interseção dos intervalos de original dos overkills provados no central (mesmo estado de crítico
  de alguma âncora). A fração é testada contra o intervalo inteiro do central.
- **Nível:** toda distribuição (a normal e a da forma A) rejeita um overkill provado cujo intervalo
  de original não cruza o cluster da sua sub-linha.
- **Piso:** toda distribuição rejeita um overkill cujo piso passa do cluster da sua sub-linha. O
  piso é o maior entre o original do dano exibido e o do leech observado com a maior taxa
  admissível.

*Medido:*
- sem o nível, `aquatic` S2 13:05:51, 18:25:16 e `aquatic` S0 10:44:32 ficam vermelhos;
- com nível mas sem a restrição de estado, dois beams do `aquatic` S0 perdiam a validação;
- sem o `+k` virtual, `dlc ms` S0 21:37:37 e S1 21:54:37 perdiam a validação;
- sem o piso, o leech esparso apagava 15 rótulos de 7 colaterais, e ao menos três estavam certos
  (`kim` 16:15:34, `dlc ms` S1 21:52:37 e 21:58:41).

### D5. Leech esparso na sub-linha

`beamSublineLeechOk` aceita `hasSparseLeechConfirmationWithoutContradiction`, a mesma função que já
existe para a spell concreta (V27).

*Medido:* sem isso, `dlc ms` S0 21:44:27 fica vermelho. Com isso e sem o piso, 15 rótulos somem,
porque o consenso antigo reprovava 1 confirmação e aceitava 0.

### Regras e mecânicas que o mesmo trecho governa

- **Decisão A0/A1** (`unified-turn-resolution.js` ~340): o beam no turno inteiro dá A0 e o sufixo
  que valida o beam dá A1 (`shouldForceA1ByLeech`). Medido nos 402 beams (`sweep-beams-proto5.tsv`
  contra `sweep-beams-head.tsv`):
  - 0 contagens mudam, e nenhum turno A1 muda de motivo;
  - 20 turnos trocam de motivo entre ramos de A0:
    - 17 passam a A0 "pelo beam validado";
    - 3 vão ao default, porque o teste do turno inteiro não vê o hit virtual.
- **Isenção same-mob de M-035a:** `beamSublineExplainsSameMobSpread` usa o elemento do leitor.
- **Setup de leech via observação-ouro:** o beam validado entra no conjunto-ouro. No protótipo, o
  setup de leech das 9 sessões não mudou.
- **Cache de validação de bloco (C1)** e **memo de reversão (C3)**: o stage entra na impressão
  digital; o dano real reconstruído usa clones do hit, com `dmg` na chave de C3.
- Mecânica exclusiva de beam de sorcerer. O stage e a prova só existem onde há beam validado, e a
  trava de perda é um fato novo no parser.

## Decisões de teste

- **Comando vermelho:** `node reports/beam-subline-b-fase2/probe-b.mjs`. Hoje dá 17 vermelhos, e no
  protótipo 0.
- **Asserts** (esperados vindos do log e da regra, como na tabela da Fase 1):
  - `tools/gabarito-unified.mjs`: a contagem dos 17 alvos (guardas de não-regressão A/S) e as 3
    guardas;
  - `tests/unified-beam-sublines-by-stance.test.mjs` (novo): elemento, stage e `beamSide` por hit
    dos 17 alvos, a ausência de sub-linha em 18:31:58 e em `kim` 16:15:56, e o stage da sessão das 9
    sessões;
  - teste sintético das provas: reserva que encheu, perda de recurso no meio, estado de crítico
    diferente e hit virtual no N.
- **Atenção depois:**
  - os casos `kim-ms-beam-small/*`, `dlc-ms-beam/*` e `death-echo-aa-before-beam/*` do gabarito;
  - `tests/unified-beam-mastery-stages.test.mjs`;
  - `unified-beam-overkill-subline-cardinality` (`death echo` 11:06:15 e 11:06:22);
  - `unified-sorcerer-stance*` e `ui-sorcerer-stance`;
  - as invariantes M-015 e M-025 nos fixtures de sorcerer.
- **Revisão dos colaterais na Fase 4.** São os 69 turnos do diff do protótipo
  (`reports/beam-subline-b-fase3/diff-v5-categorias.txt`):
  - 30 com overkill ganhando rótulo;
  - 18 beams que passam a validar, 8 deles carimbos órfãos agora provados;
  - 3 trocas (`kim` 16:25:08; `dlc ms` S0 21:36:07; S1 21:58:41);
  - 1 perda real (`dlc ms` S0 21:35:10);
  - 1 mudança só de resolver (`dlc ms` S0 21:37:37).

## Risks / Trade-offs

- [A forma A cria um central a partir de um overkill] → só com dano real provado, estado de crítico
  comparável e fração de stage fechando no stage da sessão. `kim` 16:15:56 é a guarda.
- [O piso usa o leech com a maior taxa admissível] → é o menor dano real possível, logo só exclui
  o que é mecanicamente impossível.
- [O teste do turno inteiro não vê hits virtuais] → medido: 3 turnos só de resolver, todos A0, e
  0 contagens. Fica como non-goal declarado.
- [Carimbo de beam em AA continua, quando o turno inteiro fecha com o AA dentro de uma lateral] →
  a decisão A1 vem da fronteira de tempo, acima na escada, e o usuário declarou o rótulo em AA
  indiferente.
- [`dlc ms` S0 21:35:10 perde 2 rótulos] → central 4 e lateral 9 fecham com `2990 OK`, `6432 OK`
  ou o virtual no central; o log não decide. O rótulo antigo vinha do consenso que reprovava 1
  confirmação.

## Decisões do usuário (gate da Fase 3, 27/Set/2026)

1. O **piso** do overkill entra como parte de M-035b.
2. A prova "a reserva não encheu" leva a **trava de perda de recurso**: nenhuma perda do mesmo
   recurso entre o overkill e os hits seguintes.
3. `dlc ms` S0 21:35:10 fica **sem rótulo** em `2990 OK` e `6432 OK` (ambiguidade real).
4. Stage sem unanimidade, ou sem beam discriminante: **desconhecido**, com os 3 admitidos, e nunca
   por maioria.
5. Ficam fora da B, como pendência declarada:
   - os carimbos órfãos de `kim` 16:14:08, 16:18:55, 16:23:43 e 16:25:31 e `alumnishocks 2`
     18:24:35 (change C);
   - a cegueira do teste do turno inteiro ao hit virtual;
   - o rótulo em AA;
   - a ambiguidade de contagem do bônus por alvo.

## Decisão do usuário na Fase 4 (revisão de código, 27/Set/2026)

6. **Forma A: todo overkill com leech posto no central precisa de prova.** Vale o comportamento do
   protótipo, e o texto de M-035b foi alinhado a ele. A revisão de spec apontou que o texto
   antigo ("pelo menos um overkill provado") admitia um overkill sem prova no central. Medido:
   a leitura do texto antigo mudaria só `dlc ms` S0 21:42:47, que passaria a validar com
   `2950 OK` (vida 164, mana 4, sem prova) no central. Os dois rótulos laterais sem prova do
   corpus (`kim` 16:20:13 `nighthunter 737 OK`; `dlc ms` S0 21:36:36 `darklight striker
   3761 OK`) não mudam em nenhuma das duas leituras, porque outras restrições os forçam ao
   lateral.

## Open Questions

- Nenhuma de escopo.
