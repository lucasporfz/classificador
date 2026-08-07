# AGENTS.md

> **Antes de tudo: leia integralmente `docs/CLASSIFICATION_RULES.md`.**
> Nenhuma implementação, revisão, teste, refatoração ou proposta de change
> (OpenSpec) deve começar antes dessa leitura. Toda decisão de classificação
> precisa ser justificada por uma regra existente nesse arquivo.

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
- `tools/run-unified-checks.mjs`: executor da validação obrigatória (gabarito
  prioritário + invariantes + todos os `tests/*.test.mjs`).
- `tools/gabarito-unified.mjs`: única porta prioritária de turnos curados.
- `tools/unified-invariants.mjs`: invariantes mecânicas sobre os resultados
  canônicos já classificados.
- `tools/dump-unified.mjs`: dump completo, artefatos candidate e promoção
  explícita para latest.
- `tools/query-unified-dump.mjs`: consulta somente o latest aceito; nunca
  classifica.
- `tools/unified-experimental.mjs`: compatibilidade histórica temporária para os
  casos únicos inventariados; não faz parte do runner obrigatório.
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

Depois de qualquer alteração no classificador, a validacao operacional de
classificacao/drift do Unified e feita pelas ferramentas Node do proprio motor
(as mesmas usadas pelo Claude neste projeto), nao pelos testes Python:

```bash
node tools/diag-unified-turn.mjs "logs/<sv>.txt" "logs/<lc>.txt" HH:MM:SS [--session N|DD/Mon/YYYY]
node tools/gabarito-unified.mjs
node tools/dump-unified.mjs --write-candidate
node tools/dump-unified.mjs --promote-candidate
```

- `diag-unified-turn.mjs`: diagnostico hit-a-hit do turno alvo.
- `gabarito-unified.mjs`: gabarito curado de turnos Unified; pode ter falhas
  pre-existentes, mas a mudanca nao pode introduzir falha nova.
- `dump-unified.mjs`: dump completo para diff zero-drift antes/depois. Para
  mudancas de escopo claro, rode primeiro com `--pairs "<fixtures>"` e so depois
  rode o corpus inteiro. `--write-candidate` grava dump, resumo e manifest sem
  substituir o latest; `--promote-candidate` apenas promove o candidate já
  validado e não classifica.
- Para responder quantidade/lista atual de turnos sem classificação, use:

```bash
node tools/query-unified-dump.mjs [--list-unclassified]
```

  Esta consulta lê o último dump aceito. É proibido gerar um dump silenciosamente
  para responder essa pergunta. Se o latest não existir, informe isso; para
  conferir apenas a identidade das fontes, use `--verify-source` (continua sem
  classificar).
- Se `dump-unified.mjs` mostrar qualquer alteracao fora do turno alvo, gerar o
  detalhe com:

```bash
node tools/diag-changed-turns.mjs --diff diff-unified.txt > reports/<change>-review.txt
```

Tambem rodar a validacao obrigatoria do motor Unified (gabarito curado +
varredura de invariantes mecanicos + todos os `tests/*.test.mjs`):

```bash
node tools/run-unified-checks.mjs
```

O runner executa primeiro o gabarito prioritário atual (160 casos), depois as
invariantes mecânicas reutilizando classificações compatíveis no mesmo processo,
e por fim os testes JS. O cache persistente é invalidado pelo conteúdo do motor,
das sessões e das opções; cache nunca substitui dump ou gabarito.

**Nao usar `python`/`pytest`** — este repo e 100% Unified/JS e os wrappers Python
foram removidos (nao tinham logica propria: eram `subprocess.run(["node", ...])`
sobre estes mesmos alvos, e cobriam a menos que o runner atual). Falhas
pre-existentes conhecidas, que falham em `HEAD` limpo: `experimental-ui-parity`,
`mob-element-regime`, `unified-spiritual-outburst-multistage`.
Com a cobertura canônica ampliada para todas as fixtures, a invariante também
expõe o achado preexistente `invariants/ms boss` em `22:20:35` (M-009); não
alterar a classificação apenas para esconder esse achado.

## Motor único e protocolo de correção

Fonte de verdade: `docs/CLASSIFICATION_RULES.md`.

O **único** motor a ser alterado é o `unified-classification-engine` — ele é o
classificador atual.

- **Diagnóstico de turno é pelo Unified:** `node tools/diag-unified-turn.mjs`
  (mesmas opções da UI, tabela pós-cutoff por data). O classificador legado e suas
  ferramentas foram removidos do repositório em 21/Jul/2026
  (`remove-legacy-classifier`); tudo em `tools/` roda o Unified.

- Regra histórica deste projeto: correções viram função-sobre-função e quebram
  outros turnos. Isto está **PROIBIDO** de acontecer novamente.

### Como corrigir (obrigatório)

1. Identifique qual é a função **CANÔNICA** da regra envolvida nos casos/turnos
   problemáticos. A correção acontece **DENTRO** dela.
2. **PROIBIDO** criar função nova como contorno. Se uma função nova for inevitável,
   no **MESMO diff** você deve apagar a(s) função(ões) antiga(s) que ela substitui e
   atualizar as chamadas. Sem net-add de validador concorrente.
3. **PROIBIDO** adicionar limiar numérico, constante mágica ou ramo special-case
   (`if vocação ==` / `if mecânica ==`) para fechar este turno. Se achar que precisa,
   **PARE e me pergunte antes.**
4. No fim, entregue:
   - Função(ões) e arquivo(s) tocados (lista curta).
   - Diff mínimo.
   - O turno problemático adicionado ao arquivo de gabarito.

Faça apenas a alteração necessária para este turno. Não refatore além do pedido.

## Workflow OpenSpec (spec-driven)

Este projeto usa OpenSpec (esquema `spec-driven`) para mudanças não triviais no
classificador. **Antes de propor ou implementar qualquer change, leia
`docs/CLASSIFICATION_RULES.md`** — a spec do change deve referenciar a(s) regra(s)
que a justificam; se não houver regra correspondente, registre a ambiguidade em vez
de inventar uma (ver "Restrições obrigatórias").

- **Contexto e regras do projeto:** `openspec/project.md` e o campo `context:` em
  `openspec/config.yaml`.
- **Specs principais (estado atual):** `openspec/specs/`.
- **Changes ativos:** `openspec/changes/<id>/` — cada um com `proposal.md`,
  `design.md`, `tasks.md` e `specs/<capability>/spec.md`.
- **Changes arquivados:** `openspec/changes/archive/`.

Skills do ciclo: `opsx:propose` (criar change + artefatos), `opsx:apply`
(implementar tasks), `opsx:sync` (sincronizar delta specs em `openspec/specs/`),
`opsx:archive` (finalizar). Ao implementar um change, rode os mesmos
[comandos obrigatórios](#comandos-obrigatórios-após-mudanças) acima antes de
arquivar.
