## Why

`drone ingol` S0 infere incorretamente `humanoid +2%` a partir de uma unica linha holy, embora esse excesso tambem possa ser explicado por BM, e deixa 64 de 189 turnos sem classificacao. A mesma sessao possui Caldera/Barrage deterministicas com estados marcados e nao marcados por Bounty, mas o fallback existente mistura os dois grupos ao estabelecer o original e nao consegue usar a evidencia conforme D-010g.

## What Changes

- Fazer M-036/C-012a abster da inferencia de perk de classe quando as unicas linhas da classe sao holy/physical e, portanto, confundidas com BM.
- Fazer o fallback deterministico de Bounty fixar o original comum somente pelos hits nao marcados e testar os hits marcados contra essa ancora.
- Manter `overpower charm` fora de qualquer inferencia de percentual de Bounty.
- Adicionar `drone ingol` ao gabarito e validar o corpus contra o baseline pre-correcao de 21.287 turnos / 125 unresolved.

## Capabilities

### New Capabilities

- Nenhuma.

### Modified Capabilities

- `unified-bm-pierce-detection`: linhas holy/physical sem testemunha de classe em elemento imune a BM nao podem confirmar perk de classe.
- `unified-bounty-talisman-inference`: componentes deterministas usam controles nao marcados como ancora independente e marcados apenas para votar no nivel.

## Impact

- `js/unified-classification-engine.js`: funcao canonica `inferBestiaryClassDamageBonus`.
- `js/unified-setup-inference.js`: funcao canonica `inferBountyDamageFromFrozenComponents`.
- `tests/*.test.mjs` e `tools/gabarito-unified.mjs`: cobertura de regressao do setup e de turnos revisados.
- Sem alteracao de UI, parser, grade de niveis ou limiares numericos.
