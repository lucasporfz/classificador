## Context

O motor Unified e caro por sessao, enquanto `gabarito-unified.mjs` executa a mesma classificacao novamente para cada caso. Em paralelo, o gabarito direto e o gabarito de `unified-experimental.mjs` mantem casos em arquivos diferentes; a mecanica de municao elemental ja demonstrou drift de cobertura. Esta etapa deve melhorar o ciclo de validacao sem tocar em `js/` nem em decisoes regidas por `docs/CLASSIFICATION_RULES.md`.

## Goals / Non-Goals

**Goals:**

- Manter uma representacao canonica para casos compartilhados pelos harnesses.
- Classificar cada sessao no maximo uma vez por combinacao de fixture e opcoes durante uma execucao do gabarito direto.
- Preservar ordem, expectativas, diagnosticos e codigos de saida das CLIs.
- Tornar cada etapa reversivel e comprovada por fingerprint de classificacao.

**Non-Goals:**

- Alterar regras, resultados, UI ou arquivos do motor Unified.
- Paralelizar processos nesta etapa.
- Introduzir cache persistente entre revisoes diferentes do codigo.
- Migrar todos os helpers duplicados dos tools de uma vez.

## Decisions

### Catalogo como dados, nao como executor

Casos compartilhados serao descritos em modulo sem efeitos colaterais. Cada harness continuara responsavel por adaptar o resultado do motor ao seu formato. Isso evita acoplar o gabarito direto ao adapter de UI e permite migracao incremental.

Alternativa rejeitada: importar `unified-experimental.mjs` diretamente. O arquivo executa CLI, carrega UI e encerra o processo, portanto nao e um limite reutilizavel seguro.

### Cache por sessao classificada

`gabarito-unified` carregara e pareara sessoes uma vez por fixture. O cache de classificacao sera indexado por arquivos, identidade da sessao e opcoes estaveis. Casos apenas consultarao turnos do resultado cacheado.

Antes de classificar uma sessao, o harness verificara se o timestamp bruto procurado existe no texto do Server Log. Uma sessao sem esse fato observado nao pode conter um turno ancorado naquele timestamp e sera descartada sem executar o motor.

Alternativa rejeitada: cache somente por timestamp. Isso ainda repetiria o trabalho caro para casos diferentes da mesma sessao e poderia misturar sessoes de mesma hora.

### Compatibilidade primeiro

As funcoes publicas de CLI e a ordem original dos casos permanecerao. O cache nao armazenara resultados entre processos ou revisoes, evitando stale data durante diffs antes/depois.

### Consulta experimental por timestamps

O gabarito experimental agrupara os casos selecionados por fixture e consultara apenas sessoes cujo Server Log contenha ao menos um dos horarios pedidos. A classificacao continuara cacheada por sessao, nao pela consulta.

O modo de invariantes permanece exaustivo. Um modo diagnostico sem pre-filtro permitira comparar o resultado otimizado com o fluxo anterior durante a transicao.

### Invariantes com dono unico

O bloco `audit/*` do gabarito repetia T-003, M-032, M-009, M-006, M-033 e N-010 para tres fixtures inteiras. `turnInvariantViolations` ja executa as mesmas provas, e ainda T-006, em todas as fixtures do modo de invariantes; M-024 e M-025 tambem sao verificados ali. A auditoria duplicada sera removida do gabarito, mantendo cobertura no modo canonico obrigatorio.

### Escopo explicito no runner

`run-unified-checks.mjs` aceitara `--match` somente quando exatamente um modo (`--gabarito`, `--invariants` ou `--tests`) for escolhido. Gabarito e invariantes receberao o filtro pelo `--only` interno; testes serao filtrados pelo nome descoberto. O comando sem `--match` permanece integral e obrigatorio antes de concluir uma mudanca.

## Risks / Trade-offs

- [Casos dos dois harnesses possuem formatos de expectativa diferentes] -> compartilhar inicialmente apenas metadados e predicados simples comprovadamente equivalentes; manter adaptadores pequenos em cada executor.
- [Objetos do resultado podem ser mutados por uma assercao] -> assercoes serao somente leitura e o catalogo nao recebera referencia mutavel para modificar.
- [Cache pode misturar opcoes] -> a chave inclui todas as opcoes de classificacao usadas pelo executor.
- [Pre-filtro pode descartar sessao relevante] -> ele exige apenas a presenca textual exata de `HH:MM:SS` no Server Log; nenhum criterio mecanico ou de classificacao participa da decisao.
- [Uso isolado de `--gabarito` deixa de executar invariantes] -> o contrato da CLI separa gabarito curado de invariantes exaustivos; `run-unified-checks.mjs` continua executando ambos na validacao obrigatoria.
- [Filtro pode produzir falso verde vazio] -> cada modo rejeita zero correspondencias com exit code 2; `--match` exige exatamente um modo explicito.
- [Refactor amplo dificulta retorno] -> separar catalogo, cache e migracao dos casos em checkpoints independentes.

## Migration Plan

1. Adicionar a spec e testes de zero drift.
2. Introduzir o catalogo compartilhado e migrar os casos de `thunder-arrow` como tracer bullet.
3. Adicionar cache por fixture/sessao ao gabarito direto.
4. Medir o tracer e um grupo pesado antes de migrar os demais casos.
5. Reverter o commit corrente com `git revert` se qualquer fingerprint divergir.

## Open Questions

- A migracao completa dos 121 casos para o catalogo comum sera decidida depois da medicao do tracer bullet; esta etapa nao precisa bloquear o ganho de cache.
