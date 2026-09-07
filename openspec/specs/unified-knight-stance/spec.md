# unified-knight-stance Specification

## Purpose

Define como o motor Unified reconhece e aplica a postura do knight (Protector,
neutra e Blood Rage) a partir dos casts do dono do log. A postura e fato observado,
nao inferencia estatistica: cada troca aparece como incantacao no Local Chat, e o dano
e confirmacao. O Protector reduz o dano causado em 15% DEPOIS da conta de leech, entao
ele entra como multiplicador pos-mitigacao e sai do divisor da base de leech; Blood Rage
sobe a skill, logo o dano maior e o dano real e nada e revertido. Regra normativa: M-041
em docs/CLASSIFICATION_RULES.md.
## Requirements

### Requirement: A postura do knight e um estado de sessao inferido dos casts do dono

O motor SHALL manter, por sessao, uma linha do tempo de postura do knight com tres estados —
`protector`, `neutral` e `blood_rage` — derivada exclusivamente das incantacoes do **dono do
log** (`playerCasts`, ja filtrado por `selectedSpeaker`). O casamento SHALL ser **exato**:
somente `utamo tempo` e `utito tempo` participam. `utamo tempo san` e `utito tempo san` sao
spells de paladino e NAO participam.

A transicao SHALL ser: `utito tempo` leva sempre a `blood_rage`; `utamo tempo` leva a
`protector`, exceto quando o estado corrente ja for `protector`, caso em que leva a `neutral`
(o recast desliga o Protector).

#### Scenario: Sessao sem cast exato de postura do dono
- **WHEN** nenhuma incantacao do dono da sessao e exatamente `utamo tempo` ou `utito tempo`
- **THEN** nenhuma linha do tempo de postura e criada
- **AND** nenhum hit recebe multiplicador de postura
- **AND** o resultado da sessao e identico ao anterior a esta capacidade

#### Scenario: Paladino que lanca `utamo tempo san`
- **WHEN** o dono do log lanca `utamo tempo san` e nunca `utamo tempo`
- **THEN** a sessao NAO tem linha do tempo de postura
- **AND** nenhum hit dela recebe multiplicador de postura

#### Scenario: Recast de `utamo tempo` desliga o Protector
- **WHEN** o estado corrente e `protector` e o dono lanca `utamo tempo`
- **THEN** o estado passa a ser `neutral`

#### Scenario: `utamo tempo` a partir de Blood Rage liga o Protector
- **WHEN** o estado corrente e `blood_rage` e o dono lanca `utamo tempo`
- **THEN** o estado passa a ser `protector`

### Requirement: A troca de postura vale a partir do segundo seguinte ao cast

O estado de postura de um hit SHALL ser o estado vigente **antes** de qualquer cast de
postura cujo timestamp seja igual ao do hit. Dentro de um mesmo segundo nao existe ordem
observavel entre a fala do Local Chat e a linha do Server Log, e as duas unicas observacoes
do corpus que discriminam apontam para a postura anterior.

#### Scenario: Hit no mesmo segundo de um cast de postura
- **WHEN** um hit ofensivo do dono ocorre no mesmo segundo de um cast `utito tempo` que sai
  de `protector`
- **THEN** o hit e avaliado como `protector`

#### Scenario: Hit no segundo seguinte ao cast
- **WHEN** um hit ofensivo do dono ocorre um segundo ou mais depois do cast de postura
- **THEN** o hit e avaliado com o estado que aquele cast produziu

### Requirement: Postura desconhecida e evidencia ausente, nunca postura neutra assumida

O estado de postura SHALL ser `unknown` enquanto nenhum cast de postura do dono tiver sido
observado na sessao. Hit em postura `unknown` NAO SHALL receber multiplicador de postura, NAO
SHALL ser usado como testemunha de dano de charm e NAO SHALL entrar como observacao-ouro na
inferencia de leech da sessao. Assumir postura neutra nesse prefixo e proibido.

#### Scenario: Hits antes do primeiro cast de postura
- **WHEN** existem hits ofensivos do dono anteriores ao primeiro cast exato de postura da
  sessao
- **THEN** esses hits ficam com estado `unknown`
- **AND** nao alimentam a inferencia de taxa de leech da sessao

### Requirement: Protector e multiplicador pos-mitigacao E divisor da base de leech

O estado `protector` SHALL aplicar o multiplicador `0.85` no mesmo ponto de prey,
`utevo grav san` e bonus de classe de bestiario (`postMultiplier`), afetando igualmente a
reversao fisica e a elemental. O mesmo `0.85` SHALL sair do divisor de `leechDamageBasis`,
porque o leech e creditado sobre o dano de antes da reducao — medido em `picture`, a razao
leech/dano sob Protector e `1,1657` vezes a da postura neutra, contra `1/0,85 = 1,1765`
previsto.

#### Scenario: Reversao de original sob Protector
- **WHEN** um hit ofensivo do dono ocorre em estado `protector`
- **THEN** o original reconstruido desfaz o multiplicador `0.85` junto com os demais
  multiplicadores pos-mitigacao conhecidos

#### Scenario: Base de leech sob Protector
- **WHEN** o leech esperado de um hit em estado `protector` e calculado
- **THEN** a base usada e o dano exibido dividido por `0.85`, alem dos demais divisores ja
  aplicados

#### Scenario: Contradicoes de leech concentradas em Protector desaparecem
- **WHEN** a sessao `picture` S0 e classificada com o Protector modelado
- **THEN** a taxa de vida inferida e `0,25` e a de mana `0,16`, ambas pontos da grade de
  imbuement
- **AND** o voto de vida e o de mana ficam sem nenhuma contradicao

### Requirement: Blood Rage e mecanica declarada e nao revertida

O estado `blood_rage` SHALL ser registrado e exposto no diagnostico, mas o motor NAO SHALL
reverter, compensar nem inferir o bonus de `+25%` de skill. O bonus vem da skill, entao o
dano maior e o dano real e o leech acompanha; nao existe multiplicador a remover. A
consequencia declarada e que o dano base agregado de um knight continua misturando postura
neutra com Blood Rage.

#### Scenario: Hit sob Blood Rage
- **WHEN** um hit ofensivo do dono ocorre em estado `blood_rage`
- **THEN** nenhum multiplicador de postura entra na reversao do original
- **AND** nenhum divisor de postura entra na base de leech

#### Scenario: Sessao que so usa Blood Rage
- **WHEN** o dono da sessao lanca `utito tempo` e nunca `utamo tempo`
- **THEN** a classificacao da sessao e identica a anterior a esta capacidade

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
