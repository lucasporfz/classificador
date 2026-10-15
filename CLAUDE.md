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
- `tools/unified-validation-workflow.mjs`: gabarito curado (`tools/gabarito-unified.mjs`) e
  varredura exaustiva de invariantes mecânicos, chamados pelo runner.
- `tools/known-failures.json`: falhas pré-existentes aceitas, por caso.
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

- gabarito curado (`tools/gabarito-unified.mjs`);
- varredura exaustiva de invariantes mecânicos sobre **TODAS as sessões de TODOS os pares,
  em qualquer regime** (`--invariants`) — cobre M-024/M-025 cross-turno, cardinalidade,
  T-006 e rótulos concretos, que o gabarito curado não cobre. A cobertura é normativa
  (D-017a): a única exclusão admitida é `CORPUS_EXCLUSIONS`, e é **proibido** reintroduzir
  recorte por data. Travada por `tests/unified-invariants.test.mjs`;
- todos os `tests/*.test.mjs`, descobertos do disco.

A validação é 100% Node: os wrappers Python antigos foram removidos, e `python3` no Windows
abre o stub da Microsoft Store e trava.

## Armadilhas operacionais

- **Falhas pré-existentes:** ficam em `tools/known-failures.json`, uma por caso. O
  `run-unified-checks` termina com `FALHAS NOVAS: N` (exit `3` = falha nova, `1` = só
  conhecidas). O histórico de baselines e medições de cada change está em
  `docs/history/medicoes-e-baselines.md`.
- **Heap:** o gabarito + invariantes com cache frio passa de 8 GB. O runner passa 14 GB aos
  filhos (`UNIFIED_CHECKS_HEAP_MB` ajusta); `NODE_OPTIONS` não vence o flag do filho.
- **Dump completo:** use `node tools/dump-unified-per-pair.mjs`, porque
  `dump-unified.mjs` sem `--pair` estoura a memória. `--pair` casa por substring
  (`server log rp.txt` puxa `murcion`/`darklight`); para medir par a par, filtre pelo nome
  exato.
- **Worktree limpo:** o `.gitignore` ignora `tests/` (só `validator-smoke`, `fixtures/` e
  `snapshots/` são rastreados). Copie `tests/*.test.mjs` para dentro, senão os testes falham
  por arquivo inexistente.
- **Cobertura de invariantes não encolhe** (D-017a, travada por
  `tests/unified-invariants.test.mjs`). "N fixtures fora do escopo D-017" num relatório é bug
  de cobertura.
- `js/unified-worker.js` e `js/classify-port.js` são da UI (worker), não do motor: não entram
  em `ENGINE_FILES` nem nas listas das tools/tests.

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

# Behavioral guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
