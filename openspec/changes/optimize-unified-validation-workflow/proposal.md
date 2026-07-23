## Why

Os harnesses obrigatorios do Unified repetem classificacoes caras das mesmas sessoes e mantem catalogos de gabarito concorrentes, tornando correcoes lentas e permitindo que uma mecanica nova seja coberta por um executor mas ignorada por outro. O fluxo precisa reduzir trabalho duplicado sem alterar a classificacao de nenhum turno gabaritado ou do corpus.

## What Changes

- Introduzir um catalogo canonico de casos de gabarito consumido pelos executores Unified.
- Agrupar casos por fixture e sessao para que cada combinacao de entrada e opcoes seja classificada uma unica vez por execucao.
- Preservar CLIs, ordem dos casos, mensagens de resultado e codigos de saida existentes.
- Congelar fingerprints de classificacao para exigir zero drift durante otimizacoes de desempenho.
- Preparar um runtime compartilhado para carregamento do motor e pareamento de sessoes em mudancas posteriores, sem alterar o motor nesta primeira etapa.

## Capabilities

### New Capabilities
- `unified-validation-workflow`: Execucao canonica, cacheada e sem drift dos gabaritos e ferramentas de validacao do Unified.

### Modified Capabilities

Nenhuma. As regras e os resultados de classificacao existentes permanecem inalterados.

## Impact

- Afeta inicialmente `tools/gabarito-unified.mjs`, `tools/unified-experimental.mjs` e modulos auxiliares novos sob `tools/`.
- Nao altera UI, parser, regras de dominio nem o classificador de producao.
- Nenhuma dependencia externa nova.
- Todos os resultados esperados e fingerprints de turnos devem permanecer identicos.
