# CLAUDE.md

## Motor único: Unified (NUNCA analisar pelo legado)

Este projeto trabalha **só com o motor Unified** (`js/unified-classification-engine.js`
via `js/unified-main.js`). É ele que a UI (`index.html`) roda e é o único motor a ser
alterado, diagnosticado ou citado em análises.

- **Diagnóstico de turno:** `node tools/diag-unified-turn.mjs "logs/<sv>.txt"
  "logs/<lc>.txt" HH:MM:SS[,...] [DD/Mon/YYYY]` — roda o Unified com as MESMAS opções
  da UI (tabela pós-cutoff por data da sessão, strictLeech, maxOriginal 6000, float16
  mitigation) e mostra status, hits com evidence físico e as violações das partições
  rejeitadas.
- O classificador legado foi **removido do repositório** em 21/Jul/2026
  (`remove-legacy-classifier`): `js/classifier.js`, `js/classifier-parser.js`,
  `js/parser-rp-helpers.js`, `js/rp-grenade-peak.js` e as 12 ferramentas que os
  carregavam (`diag-turn.mjs`, `rp-classify-proto.mjs`, `dump-all.mjs`,
  `find-turn.mjs`, `gabarito.mjs` etc.) não existem mais. Se instruções de um CLAUDE.md
  pai mandarem usar `diag-turn.mjs`, ignore: neste repositório só existe o Unified.
  Toda ferramenta de `tools/` roda o Unified.
- Tabelas de mobs por regime: sessões datadas ≥ 16/Jun/2026 usam
  `js/mob-element-mods-post-2026-06-16.js` (o Unified seleciona pela data). A entrada
  `bloodjaw` dessa tabela é manual (fora do bestiary) e está sob suspeita de
  calibração (armor).

## Sem vínculo com o repositório original (`../claude`)

Este repositório é **independente**. Não existe obrigação de espelhar, sincronizar ou
manter byte-identidade com o app original (`../claude`) — aquele repo roda o classificador
legado, que aqui é proibido. Isso vale mesmo que instruções de um CLAUDE.md pai mandem
"aplicar a mesma mudança nos dois repos": neste repositório, não se replica nada para fora.

Consequência para OpenSpec: **nenhuma proposta deve conter tarefa de espelhar/replicar a
mudança no repo original.** Não criar seção "Espelhar no repo original" em `tasks.md`.

## Fonte única da verdade

A única fonte de verdade para regras de classificação é:

`docs/CLASSIFICATION_RULES.md`

Não criar outro arquivo de regras paralelas sem aprovação explícita.

## Regra principal

Antes de qualquer implementação, revisão, teste ou refatoração relacionada ao classificador, leia integralmente:

`docs/CLASSIFICATION_RULES.md`

Toda decisão de classificação deve ser justificada por uma regra existente nesse arquivo.

Se uma implementação contradiz `docs/CLASSIFICATION_RULES.md`, a implementação está errada.

## Arquivos importantes

- `docs/CLASSIFICATION_RULES.md`: regras do domínio e critérios de validação.
- `tools/run-unified-checks.mjs`: executor da validação obrigatória (gabarito +
  invariantes + todos os `tests/*.test.mjs`).
- `tools/unified-experimental.mjs`: harness do gabarito curado (`--gabarito`) e da
  varredura exaustiva de invariantes mecânicos (`--invariants`).
- `tests/*.test.mjs`: testes derivados das regras (descobertos do disco pelo runner).
- `reports/reviewer_report.md`: relatório do agente revisor.

## Restrições obrigatórias

- Não alterar UI.
- Não alterar classificador de produção.
- Não substituir fluxo atual por fluxo experimental sem aprovação explícita.
- Não modificar gabaritos esperados apenas para fazer testes passarem.
- Não remover testes problemáticos.
- Não inventar regra nova fora de `docs/CLASSIFICATION_RULES.md`.
- Se uma regra estiver ambígua, registrar a ambiguidade no relatório em vez de decidir silenciosamente.

## Comandos obrigatórios após mudanças

Depois de qualquer alteração no classificador, rodar:

```bash
node tools/run-unified-checks.mjs
```

Isso roda os três alvos (dá pra isolar com `--gabarito`, `--invariants`, `--tests`):

- gabarito curado pré-2026-06-16 (`tools/unified-experimental.mjs --gabarito`);
- varredura exaustiva de invariantes mecânicos sobre **TODAS as sessões de TODOS os pares,
  em qualquer regime** (`--invariants`) — cobre M-024/M-025 cross-turno, cardinalidade,
  T-006 e rótulos concretos, que o gabarito curado não cobre. A cobertura é normativa
  (D-017a): a única exclusão admitida é `CORPUS_EXCLUSIONS`, e é **proibido** reintroduzir
  recorte por data. Travada por `tests/unified-invariants.test.mjs`;
- todos os `tests/*.test.mjs`, descobertos do disco.

**Não usar `python`/`pytest`.** Este repo é 100% Unified/JS. Os antigos
`tools/run_classifier_evals.py`, `tests/test_classifier_golden.py` e
`tests/test_classification_rules.py` não tinham lógica própria — eram
`subprocess.run(["node", ...])` sobre exatamente estes alvos — e foram removidos.
Cobriam a menos que o runner atual (três `tests/*.test.mjs` nunca eram chamados).
CI (`.github/workflows/validate.yml`) sempre foi 100% Node e nunca dependeu deles.

**Baseline conhecido (medido em 01/Set/2026, após `make-leech-channel-abstention-explicit`).**
Total de alvos: **41/46 OK**; gabarito **217/217**; invariantes **39/40** fixtures limpos, com a
única falha em `bakradrone 09:57:20` (declarada em S-014f). Dump: **19.983** turnos.

As 5 falhas são as mesmas de sempre e todas **pré-existentes**: `gabarito prioritario +
invariantes mecanicas` (a falha do `bakradrone`), `experimental-ui-parity`, `mob-element-regime`,
`unified-grav-san-ratio-witness` e `unified-spiritual-outburst-multistage`.

**O corpus tem 40 pares:** `aquatic` (86 turnos, sorcerer `Stingz`, pack de quara, 3 sessões de
31/Ago/2026) e mais um par entraram em `logs/` fora desta change — é de onde vêm os turnos a mais
em relação ao baseline anterior, sem que nenhum turno tenha sido resolvido ou perdido.

**Drift desta change: ZERO** — o dump é byte-idêntico antes e depois, nos 40 pares e 19.983
turnos. A regra é **C-006b** (abstenção de canal de leech é explícita, não taxa zero): o setup
passa a carregar `lifeBaseKnown`/`manaBaseKnown` e `lifeBaseAbstention`/`manaBaseAbstention`; o
`base: 0` continua desligando o canal a jusante, exatamente como antes. Diagnóstico em
`reports/aquatic-s0-life-leech-abstention.md`. Pendência declarada: `aquatic` S0 continua sem
taxa de vida (só 2 observações-ouro, 7 dos 9 hits-ouro no cap de HP) — recuperá-la exigiria
alargar o conjunto-ouro de `componentGoldN`, que é mudança de cobertura, não de canal.

**Baseline anterior, para referência (medido em 27/Ago/2026, após `fix-amp-kor-tier-inference-and-h005g-cut-gate`).**
Total de alvos: **39/44 OK**; gabarito **217/217**; invariantes **37/38** fixtures limpos, com a
única falha em `bakradrone 09:57:20` (declarada em S-014f). Dump: **19.897** turnos, **58** sem
classificação.

As 5 falhas são as mesmas de sempre e todas **pré-existentes**: `gabarito prioritario +
invariantes mecanicas` (a falha do `bakradrone`), `experimental-ui-parity`, `mob-element-regime`,
`unified-grav-san-ratio-witness` (o código de D-030b/D-030c que ela exercita está em `git stash`)
e `unified-spiritual-outburst-multistage`. O alvo a mais (43→44) é o teste novo desta change.

**O corpus tem 38 pares desde 27/Ago/2026:** o fixture `tom 2` (346 turnos, EK, raubritter, mesmo
personagem de `tom` — `Kikaro`, level 1002) entrou em `logs/` durante esta change. É por isso que
o dump vai de 19.548 para 19.897 turnos sem que nenhum turno tenha sido resolvido ou perdido. Ao
comparar com o baseline anterior, exclua `tom 2` ou os números não batem.

**Drift desta change: 1 turno** — `tom 2` `12:58:06`, de `a=0 s=5` para `a=1 s=4`. Zero drift nos
outros 37 fixtures, em 19.897 turnos. As regras são **H-005g** (guarda de último recurso
corrigida: testava mudez sobre o primeiro hit em vez de mudez sobre o corte) e **M-034a** (piso de
cardinalidade para o tier do Executioner's Throw). Diagnóstico em
`reports/tom-amp-kor-diagnostico.md`.

**Pendência declarada de M-034a:** o piso conta hits do bloco **já classificado**, não alvos do
cast, então um AA fundido por engano empurra o tier **para cima** — inverso do viés da razão de
dano, que empurra para baixo. Os dois erros não se cancelam. O próprio `tom 2` `12:58:06` tinha 5
hits antes da correção de H-005g nesta mesma change, e o piso teria cravado `×2.50`. Fora de
escopo e não resolvido: a rotulagem `base`/`amped` por hit (`execBimodalHighSet` corta no maior
salto de leech, que um valor capado sequestra — `tom` `12:35:15` rotula o hit `1185` como `amped`
sendo `base`). Duas tentativas de corrigir isso foram revertidas por quebrarem hits vizinhos.

**Baseline anterior, para referência (medido em 26/Ago/2026, após `infer-weapon-physical-pierce-per-session`).**
Total de alvos: **38/43 OK**; gabarito **253/253**; invariantes **37/38** fixtures limpos, com a
única falha em `bakradrone 09:57:20` (declarada em S-014f). Dump: **19.548** turnos, **58** sem
classificação. `query-unified-dump.mjs --verify-source` dá **exit 0** — o `latest` foi promovido
em 27/Ago/2026 e corresponde ao motor; a defasagem crônica que dava exit 3 acabou.

As 5 falhas são todas **pré-existentes**: `gabarito prioritario + invariantes mecanicas` (a falha
do `bakradrone`), `experimental-ui-parity`, `mob-element-regime`, `unified-grav-san-ratio-witness`
(o código de D-030b/D-030c que ela exercita está em `git stash`) e
`unified-spiritual-outburst-multistage`. O alvo a mais (42→43) é o teste novo desta change.

**Drift desta change: 79 turnos, todos em `moonsilver`** — 78 que passaram de `unresolved` a
resolvido e 1 (`05:24:53`) cuja granada migrou para o turno em que de fato explodiu
(`05:24:51`, `cast+3`). Zero drift nos outros 37 fixtures, em 19.548 turnos. A regra é **M-040**
e o diagnóstico está em `reports/moonsilver-fase2-pierce-fisico.md`.

**O detector de M-040 seleciona o perk em 1 de 132 sessões do corpus** (`moonsilver` S0). Em 93
delas ele nem roda (`insufficient_eligible_blocks`): só há evidência em pack de AoE com ≥3 blocos
de AA de ≥3 hits e ≥2 mobs. Consequência declarada e aceita: em hunt de boss o perk fica
invisível e o dano base sai enviesado sem sintoma. Varredura: `tools/probe-weapon-pierce-corpus.mjs`.

**Baseline anterior, para referência (medido em 26/Ago/2026, após `implement-h005e-h005f-h005g-leech-cardinality-rules`).**
Total de alvos: **36/42 OK**; gabarito **210/210**; invariantes **36/37** fixtures limpos, com a
única falha em `bakradrone 09:57:20` (declarada em S-014f). Dump: **19.356** turnos, **58** sem
classificação — o MESMO número do baseline anterior: a change não resolveu nem quebrou nenhum
turno `unresolved`, só reclassificou turnos já resolvidos.

As 6 falhas são todas **pré-existentes**: `gabarito prioritario + invariantes mecanicas` (a
falha do `bakradrone`), `experimental-ui-parity`, `mob-element-regime`,
`unified-grav-san-ratio-witness`, `unified-spiritual-outburst-multistage` e
`unified-experimental-coverage` (contrato travado em 204 contra gabarito 210 — vem de
`tools/gabarito-unified.mjs` modificado no working tree por #15/#20, não desta change). Os 2
alvos a mais (40→42) são os testes novos desta change.

**Drift desta change: 88 turnos, 100 % `a=0 → a=1`, zero no sentido inverso** — 80 em `tom` e 8
em `ek boss`, **nenhum** em qualquer outro fixture. `tom` sai de **124** turnos `a=0` para
**44**, dos quais 39 são corretos (6 de hit único, 33 cujo primeiro hit declara `N` entre 2 e 9).
Os 8 de `ek boss` são ganho, não colateral: em todos o AA e o bloco da spell acertam o mesmo mob
com dano muito diferente (prova independente por `S-004a`). A ausência de flips no sentido
`a=1 → a=0` é garantida por construção pela semântica **aditiva** de `H-005e`.

**O fixture `moonsilver` (192 turnos) está FORA desta medição por decisão do usuário.** Ele foi
adicionado a `logs/` em 26/Ago/2026 durante a change; o corpus o descobre automaticamente
(38 pares), mas tanto a validação quanto o dump candidato desta change cobrem os **37** pares
anteriores. Ao medir contra este baseline, exclua `moonsilver` ou o número de turnos não bate.

**Baseline anterior, para referência (medido em 24/Ago/2026, após `apply-omega-cross-state-tolerance-as-last-resort`).**
Total de alvos: **35/40 OK**; gabarito **239/239**; invariantes com **1** falha, a declarada em
S-014f (`bakradrone 09:57:20`). Dump: **18.958** turnos, **58** sem classificação.

As 5 falhas são todas **pré-existentes** e idênticas antes e depois da change:
`gabarito prioritario + invariantes mecanicas` (a falha de invariante do `bakradrone`),
`experimental-ui-parity`, `mob-element-regime`, `unified-grav-san-ratio-witness` (o código de
D-030b/D-030c que ela exercita está em `git stash`) e `unified-spiritual-outburst-multistage`.
Os 2 alvos a mais vieram desta change (`unified-omega-cross-state-exactness`,
`unified-omega-last-resort`); os outros 2 do 38 vieram de changes preexistentes no working tree.

**`crypt` saiu de 118 para 1 turno sem classificação** (`07:52:37`, pendência declarada), com
**zero** turnos resolvidos perdidos e **zero** drift fora de `crypt` — as 438 linhas do diff do
dump estão todas em `crypt`, e o conjunto de turnos sem classificação dos outros fixtures é
byte-idêntico. A regra é **S-004c** (+ `S-004c-nota`); o diagnóstico está em
`reports/crypt-omega-1-nivel.md`.

**Atenção ao medir contra este baseline:** `node tools/query-unified-dump.mjs --verify-source`
devolve **exit 3** (fonte divergiu do `latest` aceito) por causa de changes preexistentes não
commitadas em `js/`, não por causa desta. O `latest` aceito (18.955 turnos / 684 sem
classificação) está defasado do working tree; para diff de drift, gere o seu próprio baseline
com `node tools/dump-unified.mjs` **antes** de editar `js/`, e não promova o candidate sem
antes resolver a defasagem.

**Baseline anterior, para referência (medido em 23/Ago/2026, após `rescue-field-hits-with-impossible-leech`).**
Comparar contra ele em vez de exigir verde total. Total de alvos: **32/37 OK**;
gabarito **203/203**; invariantes **35/36** fixtures limpos e **0 SKIP**, com a única falha em
`bakradrone 09:57:20` (limite declarado em S-014f). Dump: **18.955** turnos,
**684** sem classificação.

**O denominador mudou nesta medição — não compare 18.955/684 com 17.105/52 direto.** Duas
coisas entraram de uma vez:

- `CORPUS_EXCLUSIONS` ficou **vazio** (M-038a, issue #11). A hunt `Tue Jun 09 09:30:47 2026`
  voltou ao corpus nos três fixtures em que aparece (`bakra` S4, `drome` S4, `jaded` S4,
  209 turnos cada) e `drome` trouxe junto 4 sessões que nunca tiveram cobertura (391 turnos).
  Contribuição desta change para os turnos sem classificação: **+5** — `09:21:08` contado 3×
  (o tick de campo que M-038a não alcança, leech 3 não excede dano 9) mais `19:52:11` e
  `09:19:56` de `drome`. Todos declarados como pendência conhecida.
- `Crypt Server Log.txt` **já estava no corpus mas nunca esteve no dump aceito**: 832 turnos,
  dos quais **627 sem classificação**. É a origem de 627 dos 632 turnos sem classificação a
  mais, e **não** tem relação com M-038a. `query-unified-dump.mjs --verify-source` não pegou
  a defasagem porque a assinatura da fonte não cobre a lista de pares — é pendência aberta,
  tanto o fixture quanto o furo do `--verify-source`.

Nenhum turno previamente coberto mudou de classificação: as 1.055 remoções do diff são 100 %
renumeração `S<N>→S<N+1>`, porque a hunt reentrou no índice 4 de `bakra` e `jaded`
(verificado linha a linha, 0 linhas do latest sem contraparte).

A hunt entrou com **0 quebras de invariante** — as 5 de `M-012/M-013` que ela tinha eram
resíduo de tick de campo. Os 6 alvos a mais no gabarito (197→203) são dessa hunt. **A falha
`tests/unified-grav-san-ratio-witness.test.mjs` no working tree atual NÃO é regressão**: o
teste está no disco (o `.gitignore` ignora `tests/`) mas o código de `D-030b`/`D-030c` que
ele exercita está em `git stash` — some com `git stash pop`.

Baseline anterior, para referência (22/Ago/2026, após `exclude-field-and-dot-damage-from-main-hits`):
**32/37 OK**, gabarito **197/197**, invariantes **33/34** + 1 SKIP (`drome`), dump **17.105**
turnos e **52** sem classificação. O fixture `ek boss` entrou no corpus nessa data com 8 turnos
sem classificação e 3 quebras de M-009; `M-038` e a correção da topologia de `exori scu` para
`area` zeraram os dois.

Baseline anterior, para referência (12/Ago/2026, após `implement-s014f-boss-leech-no-veto`):
**30/34 OK**, gabarito 187/187, **52** turnos sem classificação de 16.407 (era 246 antes de
S-014f), contagem bruta = `totalUnresolved` + `knownAccepted` + `partialEdge` = 27 + 3 + 22.

O relatório **não exclui mais** leech pré-cutoff: a decisão de 19/Jul/2026 foi revogada em
11/Ago/2026 e a família caiu por `S-014f`, então o filtro padrão saiu junto com a flag
`--include-pre-cutoff-leech` (12/Ago/2026, ticket `#7`). `preCutoffLeechCounted` (ex-`…Excluded`)
virou coluna **informativa**: dos **27** turnos acionáveis, **26** têm causa de leech em sessão
pré-cutoff — concentrados em `bakradrone` 9, `jaded` 5, `darklight e vemiath` 3,
`mazzerinbarrage` 3, `bakra` 2 e 1 em cada de `darklight rp`/`hakka`/`ms boss`/`rp pack`.

- `--invariants`: **32/33 fixtures limpos, 1 SKIP** (`drome`, exclusão canônica de par
  inteiro). Falha **1**: `bakradrone` `09:57:20` (`M-009: unresolved com 3 hits no boss
  unitário`) — é o limite declarado em `S-014f`, não contradição mecânica nova.

  Antes de `S-014f` (baseline de 11/Ago) eram 28/33, com 5 fixtures falhando (`bakra`,
  `bakradrone`, `essence`, `jaded`, `mazzerinbarrage`) por quebras de M-009 derivadas,
  emitidas com `kind='unresolved'` sobre turnos de `unresolved_by_leech_contradiction`
  pré-cutoff ou `partial_edge_missing_evidence` (T-007/A-009). Elas sumiram junto com os
  turnos unresolved que S-014f destravou.

  **As 8 quebras sobre turnos RESOLVIDOS acabaram** (`fix-action-reuse-across-turns`,
  11/Ago/2026): eram `bakra`/`jaded` `10/Jun` `09:29:24`, `ms boss` `13/Jun` `22:19:24`,
  `kim` `14/Jul` `16:24:30`, `rpboss` `17/Jun` `09:40:33`, `uhax 3 ed` `03/Jul` `13:43:55`
  (×2) e `13:44:09` — todas M-015/N-007/N-008 (reuso de ação entre turnos vizinhos). A
  correção foi escolher a ação sobre o bloco final do componente e consumir spell/runa como
  a granada já fazia (M-013a/M-013b, N-008a, M-016d-1c).
- `--gabarito`: **187/187**. As 2 falhas históricas (`essence/00:21:12` e `essence/00:21:14`,
  esperado `A1`, obtido `A0 S0 R0 G0`) caíram com `S-014f` em 12/Ago/2026. Em 11/Ago/2026 o gabarito perdeu 3 casos
  (`grenade-rollover-corpus/bakra` `09:21:00`/`09:23:20`/`09:27:02`) e ganhou 13 da família
  M-015: eram os únicos casos de todo o gabarito dentro de `CORPUS_EXCLUSIONS` (hunt
  `09/Jun/2026 09:18-09:30`), removidos a pedido do usuário. O baseline de 09/Ago
  registrava as mesmas 2 falhas de `essence`.
  (Era **71/79** antes de `prefer-grenade-cast-turn-that-cannot-resolve-without-it`,
  **70/78** antes de `require-discriminating-leech-channel-in-bracket`,
  **62/70** em `68fd1e6` e **59/70** em `bfd4a26`; as changes C-012a e
  `fix-death-echo-delayed-stage-absent-evidence` adicionaram casos e corrigiram falhas.
  Ao atualizar este baseline, medir com o runner completo e não com
  `gabarito-unified.mjs --only`, cujo filtro casa mais amplo que o nome sugere.)
- `--tests`: 3 falhas pré-existentes —
  `experimental-ui-parity` (assert `{arrow:0}` vs `{arrow:1,rune:1}`),
  `mob-element-regime` (`ReferenceError: MOB_ELEMENT_MODS is not defined`),
  `unified-spiritual-outburst-multistage` (assert `[1,2]` vs `[1]`).
  Apesar do nome, `experimental-ui-parity` e `mob-element-regime` carregam **só** arquivos
  Unified/tabelas de mob — não são resíduo do legado.

**A contagem de alvos caiu de 14 para 12 em 21/Jul/2026, e isso NÃO é regressão.** Os dois
alvos que sumiram (`experimental-leech-cardinality`, `experimental-synthetic-case`) passavam,
mas carregavam `js/classifier.js` e o núcleo experimental — ou seja, mediam um motor que este
repositório não usa. Foram removidos junto com o legado (`remove-legacy-classifier`).
De 12 para 34 alvos: são `tests/*.test.mjs` novos, descobertos do disco pelo runner.

**Cobertura de invariantes não pode encolher.** Até 09/Ago/2026 a varredura aplicava D-017
como gate cego de data e pulava 17 dos 34 fixtures — o regime pós-cutoff inteiro ficava sem
cobertura, escondendo 5 quebras em turnos resolvidos. A regra agora é D-017a e há teste que
trava (`tests/unified-invariants.test.mjs`). Se um relatório voltar a dizer "N fixtures fora
do escopo D-017", é bug de cobertura, não escopo legítimo.

**Ao medir baseline num worktree limpo, copiar `tests/*.test.mjs` para dentro dele.**
O `.gitignore` ignora `tests/` (só `validator-smoke`, `fixtures/` e `snapshots/` são
rastreados), então um worktree novo não tem os testes e eles falham por arquivo
inexistente — o que é fácil de confundir com falha real.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`lucasporfz/classificador`), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at repo root, `docs/adr/` for decisions. See `docs/agents/domain.md`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
