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

**Baseline conhecido (medido em 24/Ago/2026, após `apply-omega-cross-state-tolerance-as-last-resort`).**
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
