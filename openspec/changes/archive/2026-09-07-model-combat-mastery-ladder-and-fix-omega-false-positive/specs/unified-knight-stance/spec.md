# unified-knight-stance Specification (delta)

## ADDED Requirements

### Requirement: A postura do knight e parte do estado do proc de dano de charm

A postura do knight SHALL fazer parte do estado do proc de dano de charm nas tres leituras que
consomem esse canal como testemunha — bonus de dano contra classe de bestiario (`M-036`), perk
omega (`M-039`) e pierce de Battle Momentum por testemunha de charm (`C-012a`). Essas leituras
SHALL incluir a postura na **chave de agrupamento** das linhas-testemunha e SHALL multiplicar o
valor previsto por `0,85` quando a postura do proc for `protector`. Procs em posturas diferentes
NAO SHALL compartilhar mediana nem nivel, pelo mesmo motivo que procs com e sem amplification
nao compartilham (`M-036`).

O Protector reduz o dano causado em `15%` e essa reducao **alcanca o dano de charm** — medido em
`picture`, a razao charm Protector/neutra e `0,850`. Logo a postura e estado observado do proc,
exatamente como Expose Weakness e `active elemental amplification` ja sao.

Blood Rage e a postura neutra NAO SHALL alterar o valor previsto: o `+25%` de Blood Rage vem da
skill e o dano de charm e `5%` do HP maximo do alvo, que nao usa skill — medido, a razao charm
Blood Rage/neutra e `1,00`.

Esta exigencia e cumulativa com a que ja existe para postura `unknown`: proc anterior ao
primeiro cast de postura da sessao continua fora da testemunha.

#### Scenario: Proc de charm em Protector
- **WHEN** um proc de `freeze charm` em `gorerilla` ocorre em `picture` S0 com o Protector ativo
- **THEN** o valor previsto da linha e `hitpoints x 0,05 x mitigacao x effectiveMod x 0,85`
- **AND** ele fecha em `728,1` contra o nivel observado `728`

#### Scenario: Procs do mesmo mob em posturas diferentes
- **WHEN** o mesmo `sabretooth` recebe procs de `wound charm` em Protector (`819`) e em Blood
  Rage (`927`)
- **THEN** os dois pertencem a linhas-testemunha **distintas**
- **AND** nenhuma mediana ou nivel e calculado sobre a uniao das duas

#### Scenario: Proc de charm em Blood Rage
- **WHEN** um proc de charm ocorre com Blood Rage ativo
- **THEN** o valor previsto e o mesmo da postura neutra

#### Scenario: Sessao sem cast de postura
- **WHEN** a sessao nao tem linha do tempo de postura
- **THEN** as chaves de testemunha e os valores previstos das tres leituras sao identicos aos
  anteriores a esta capacidade
