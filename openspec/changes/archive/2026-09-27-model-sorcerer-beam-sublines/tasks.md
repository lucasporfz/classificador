## 0. Baseline (bloqueia tudo)

- [x] 0.1 `node tools/query-unified-dump.mjs --verify-source` diz "idêntica ao latest" (21.981 turnos, 73 sem classificação); se não, PARAR e avisar o usuário
- [x] 0.2 Registrar as falhas pré-existentes de `node tools/run-unified-checks.mjs` (esperado 58/65: gabarito+invariantes bakradrone 09:57:20, experimental-ui-parity, mob-element-regime, unified-experimental-coverage, unified-grav-san-ratio-witness, unified-overkill-xp-continuity, unified-spiritual-outburst-multistage); aquecer antes com `node --max-old-space-size=12288 tools/unified-validation-workflow.mjs --invariants`
- [x] 0.3 `node reports/beam-subline-b-fase2/probe-b.mjs` dá os 17 vermelhos da Fase 2 (`probe-b-run2.txt`) e as 3 guardas iguais
- [x] 0.4 Dump por par dos 9 fixtures com beam e dos controles (`uhax 3`, `ingol ed`, `barrage`) como referência escopada antes de editar `js/`

## 1. Prefactor inerte: fatos novos no parser e o campo de setup (bloqueada por 0)

- [x] 1.1 `js/unified-parsing.js`: cada evento guarda quantas linhas `You lose N hitpoints` e `You lose N mana` o server log mostrou antes dele (no molde do `barrierEpoch` de D-011a); nenhum consumidor ainda
- [x] 1.2 `js/unified-session-context.js`: `beamMasteryStage` entra em `SETUP_FIELDS` (sempre `null` por enquanto)
- [x] 1.3 Dump escopado byte-idêntico ao 0.4 e `node tools/run-unified-checks.mjs --tests` sem falha nova

## 2. M-035b: prova do dano real, nível e piso nos beams que já validam (bloqueada por 1)

- [x] 2.1 Asserts vermelhos, com esperado vindo do log e da regra: `aquatic` S2 13:05:51 (`763 OK` central; `2376 OK`, `2509`, `2606×2` side), `alumnishocks 2` S0 18:25:16 (`20 OK`, `1156 OK` central; `145 OK`, `94 OK`, `235 OK` side) e `aquatic` S0 10:44:32 (`588 OK` central) em `tests/unified-beam-sublines-by-stance.test.mjs`; mais os sintéticos (reserva que encheu não prova; perda de recurso no meio desfaz a prova; estado de crítico diferente não vota). Ver VERMELHO
- [x] 2.2 Em `js/unified-validation.js`, junto de `validateBeamSublineBlock`: prova do dano real (vida e mana concordam, ou a reserva não encheu, com a trava de perda de 1.1), intervalo de original do dano real provado, piso (dano exibido e leech com a maior taxa admissível) e N com os hits virtuais de charm-kill do bloco. O nível e o piso entram na aceitação de cada distribuição, só contra âncoras do mesmo estado de crítico
- [x] 2.3 Ver 2.1 VERDE; guardas `kim` 16:15:56 e 17:16:37 intactas; dump escopado com diff restrito a rótulos de beam. Medido (27/Set/2026): igual hit a hit ao protótipo sem forma A nos 12 pares (6.840 turnos); o dump escopado muda só `alumnishocks 2` 18:31:29 (A1 S6 → A0 S7), transitório previsto, porque o A1 vem do sufixo que valida o beam e a forma A só entra na fatia 4 (4.4 cobra 0 contagens mudadas)

## 3. Leech esparso na sub-linha (bloqueada por 2)

- [x] 3.1 Assert vermelho: `dlc ms` S0 21:44:27 valida em fire, stage 3, `≈ 0,8721`, com `2420` central e `2111×2`, `2856`, `2865×2` side (teste + caso `dlc-ms-beam/21:44:27-ratio-0872` do gabarito passa a exigir beam validado). Ver VERMELHO
- [x] 3.2 `beamSublineLeechOk` aceita `hasSparseLeechConfirmationWithoutContradiction` (V27)
- [x] 3.3 Ver 3.1 VERDE; conferir no diff escopado que o piso de 2 segura os rótulos certos (`kim` 16:15:34, `dlc ms` S1 21:52:37 e 21:58:41) e que a única perda é `dlc ms` S0 21:35:10. Medido: igual hit a hit ao protótipo sem forma A (6.840 turnos); além de 21:35:10, só perdem rótulo os beams de forma A (18:22:39, 18:31:14, 18:31:42), transitório até a fatia 4

## 4. Elemento pela estância e central só em overkill (forma A) (bloqueada por 3)

- [x] 4.1 Asserts vermelhos no teste:
  - elemento: `alumnishocks 2` 18:30:18 energy; `aquatic` S2 13:05:51 energy; `death echo` 11:06:22 death; `dlc ms` S1 21:52:46 fire;
  - forma A com `beamSide` por hit e stage 1: 18:26:16, 18:31:29, 18:31:42, 18:22:39, 18:25:35, 18:27:45, 18:28:09, 18:30:11, 18:31:14;
  - 18:31:58 sem side;
  - gabarito com a contagem de hoje dos 17 alvos, 18:31:29 incluído (`A1 S6`).

  Ver VERMELHO
- [x] 4.2 `validateBeamSublineBlock` itera os elementos na ordem de `sorcererSpellElementCandidates`, com o 2º só como último recurso. Pré-cutoff usa o nativo; estância desconhecida faz busca livre com spread primeiro; contexto sem setup mantém o comportamento de hoje. Na busca livre, só as distribuições do elemento escolhido decidem o rótulo. `sorcererSpellElement` devolve o 1º elemento da máquina para beam
- [x] 4.3 Forma A: âncoras num cluster só são todas laterais; o central é a interseção dos originais dos overkills provados no central com estado de crítico de alguma âncora; a fração é testada contra o intervalo do central
- [x] 4.4 Ver 4.1 VERDE; `probe-b.mjs` com 0 vermelhos; guardas intactas; dump escopado com 0 contagens mudadas. Medido: igual hit a hit ao protótipo sem stage (6.840 turnos); contra a base, 0 contagens, 69 turnos só de rótulo e 1 só de resolver; dump escopado byte-idêntico ao 0.4; gabarito `beam` 33/33

## 5. Stage da Beam Mastery por sessão (bloqueada por 4)

- [x] 5.1 Asserts: stage da sessão 1 em `alumnishocks` S0 e `alumnishocks 2` S0; 3 em `kim`, `dlc ms` S0/S1, `aquatic` S0–S2 e `death echo`; desconhecido nos sorcerers pré-cutoff. Ver VERMELHO (o campo não existe)
- [x] 5.2 O validador expõe `beamValidStages`. `inferBeamMasteryStageFromResolved` crava por unanimidade dos beams discriminantes da passada sem leech (ou `pass1`) e é chamada antes da passada final; o validador usa só os pares do stage da sessão. O resultado da classificação expõe o stage e a evidência
- [x] 5.3 Ver 5.1 VERDE; dump escopado idêntico ao do 4.4 (medido no protótipo: o stage não muda nenhum turno). Medido: igual hit a hit ao protótipo completo (6.840 turnos); categorias do diff contra a base idênticas às de `diff-v5-categorias.txt`

## 6. Regras e glossário (bloqueada por 5)

- [x] 6.1 `docs/CLASSIFICATION_RULES.md`:
  - M-035b nova (prova do dano real, forma A, nível, piso, N com virtual, estado de crítico);
  - M-035 emendada: elemento pela máquina de M-043 com o spread na estância desconhecida, stage por sessão, Alumni Shocks = stage 1 (a frase "nenhum log exercita stage 1 ou 2" sai) e o `504 OK` do caso-prova passa a central;
  - M-043: o beam deixa de ficar fora.
- [x] 6.2 `CONTEXT.md` já emendado nesta proposta (Dano real exato, Piso, Estância, Sub-linha, Stage da Beam Mastery): conferir contra o texto final das regras

## 7. Validação e revisão (bloqueada por 6)

- [x] 7.1 Aquecer o cache (`node --max-old-space-size=12288 tools/unified-validation-workflow.mjs --invariants`) e rodar `node tools/run-unified-checks.mjs`: mesmas falhas do 0.2, nenhuma nova. Avisar a duração antes e rodar em background. Medido: 59/66, as mesmas 7 falhas do 0.2 com as mesmas mensagens; gabarito 344/344; invariantes 46/47 (só `bakradrone` 09:57:20)
- [x] 7.2 Dump completo (`node --max-old-space-size=12288 tools/dump-unified.mjs --write-candidate`) e diff contra o latest. Drift esperado: só os 70 turnos do protótipo (`reports/beam-subline-b-fase3/diff-v5-categorias.txt`), todos com contagem igual. Medido: 21.981 turnos, 73 sem classificação, diff do dump VAZIO (o dump mostra só contagens; as mudanças de rótulo estão no diff hit a hit, `reports/model-sorcerer-beam-sublines/final-base-vs-repo.txt`)
- [x] 7.3 `node tools/diag-changed-turns.mjs --diff <diff> > reports/model-sorcerer-beam-sublines-review.txt`, apresentado em três grupos: alvos; colaterais pelo mesmo mecanismo (overkill que ganha rótulo, beam que passa a validar, trocas); suspeitos (`dlc ms` 21:35:10, `dlc ms` 21:37:37). Feito: `reports/model-sorcerer-beam-sublines-review.txt` (70 turnos; o diff do dump é vazio, então a lista sai do diff hit a hit base -> repo)
- [x] 7.4 `mattpocock-skills:code-review` nos dois eixos (Standards × Spec) a partir de 15d0db7. Achados resolvidos ou aceitos em `reports/model-sorcerer-beam-sublines/code-review.md`; decisão 6 do usuário no design
- [x] 7.5 GATE HUMANO: aprovação explícita de todo turno alterado. Aprovado pelo usuário em 27/Set/2026: os 70 turnos, integralmente

## 8. Fechamento (bloqueada por 7)

- [x] 8.1 Colaterais aprovados que fixam comportamento normativo viram caso de teste (por exemplo, `kim` 16:25:08 com `1923 OK` central). Feito: kim 16:25:08, dlc ms S0 21:36:07, S1 21:52:37 e 21:58:41 (rótulos), kim 16:19:24 (órfão provado) e dlc ms S0 21:36:36 (forma A) no teste
- [x] 8.2 `graphify update .`. Feito (3.189 nós, 5.410 arestas)
- [x] 8.3 Arquivar a change (`openspec-archive-change`) e promover o candidate (`node tools/dump-unified.mjs --promote-candidate`). Feito: latest promovido (21.981 turnos, 73 sem classificação; `--verify-source` idêntica)
- [x] 8.4 Commit só quando o usuário pedir (`git add -f` para `tests/` e `openspec/`), com a hipótese confirmada da Fase 2 na mensagem (H1: o elemento pela estância só não tira validação junto com M-035b; H3: o rótulo dos overkills vem do nível do dano real e do piso). Pedido pelo usuário no gate (27/Set/2026): commit em main
