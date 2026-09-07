## ADDED Requirements

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
