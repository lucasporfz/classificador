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

**Baseline conhecido (medido em 11/Ago/2026, após `fix-action-reuse-across-turns`).**
Comparar contra ele em vez de exigir verde total. Total de alvos: **30/34 OK**.

- `--invariants`: **28/33 fixtures limpos, 1 SKIP** (`drome`, exclusão canônica de par
  inteiro). 5 fixtures falham (`bakra`, `bakradrone`, `essence`, `jaded`,
  `mazzerinbarrage`), **todos** por **quebras de M-009 derivadas**: emitidas com
  `kind='unresolved'` sobre turnos de `unresolved_by_leech_contradiction` pré-cutoff (fora
  de escopo por decisão de 19/Jul/2026) ou `partial_edge_missing_evidence` (T-007/A-009).
  Somem junto com o turno unresolved; não são contradição mecânica independente.

  **As 8 quebras sobre turnos RESOLVIDOS acabaram** (`fix-action-reuse-across-turns`,
  11/Ago/2026): eram `bakra`/`jaded` `10/Jun` `09:29:24`, `ms boss` `13/Jun` `22:19:24`,
  `kim` `14/Jul` `16:24:30`, `rpboss` `17/Jun` `09:40:33`, `uhax 3 ed` `03/Jul` `13:43:55`
  (×2) e `13:44:09` — todas M-015/N-007/N-008 (reuso de ação entre turnos vizinhos). A
  correção foi escolher a ação sobre o bloco final do componente e consumir spell/runa como
  a granada já fazia (M-013a/M-013b, N-008a, M-016d-1c).
- `--gabarito`: **185/187**, falham **2** — `essence/00:21:12` e `essence/00:21:14`
  (esperado `A1`, obtido `A0 S0 R0 G0`). Em 11/Ago/2026 o gabarito perdeu 3 casos
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
