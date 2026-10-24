# unified-overkill-boundary-evidence Specification

## Purpose
TBD - created by archiving change fix-overkill-only-turn-boundary. Update Purpose after archive.
## Requirements
### Requirement: Overkill não cria fronteira sem evidência independente

O classificador MUST NOT aceitar uma fronteira apoiada apenas na posição de hits de overkill.
D-012 estabelece que um hit de overkill herda o componente do bloco contíguo definido pelos
**outros** hits e nunca cria fronteira; quando **todos** os hits principais elegíveis de um
turno são overkill, não existe "outro hit" para definir bloco algum. Uma partição com dois ou
mais componentes só permanece admissível se a fronteira for sustentada por evidência
independente de overkill: separação de timestamp (M-005/M-012), mudança de crit-state
(D-007/S-008), linha `Using` de runa (M-017/M-018a) ou janela de explosão de granada (M-023).

#### Scenario: Turno inteiramente overkill sem evidência independente de fronteira

- **WHEN** todos os hits principais elegíveis de um turno são overkill
- **AND** estão no mesmo timestamp, com o mesmo crit-state, sem `Using` de runa e sem cast de
  granada cuja janela cubra o turno
- **THEN** toda partição com dois ou mais componentes MUST ser rejeitada
- **AND** apenas hipóteses de componente único permanecem candidatas

#### Scenario: Fronteira sustentada por evidência independente permanece válida

- **WHEN** todos os hits principais elegíveis de um turno são overkill
- **AND** existe separação de timestamp, mudança de crit-state, `Using` de runa ou janela de
  granada compatível na posição da fronteira
- **THEN** a partição MUST permanecer candidata, porque a fronteira não foi criada pelo
  overkill

#### Scenario: barrage 19:04:08 resolve como componente único

- **WHEN** o turno `barrage 19:04:08` (sessão `16/Jun/2026`) é classificado, com seus quatro
  hits principais todos em overkill, no mesmo segundo e no mesmo crit-state, e o único cast
  concreto sendo `exevo mas san`
- **THEN** a partição `arrow[3] > spell[1]` MUST ser rejeitada, porque sua única fronteira cai
  entre dois hits de overkill sem evidência independente
- **AND** o turno MUST resolver como `A0 S4` — componente único
  `Divine Caldera (exevo mas san)`

### Requirement: A rejeição por overkill MUST ficar fora do teste de cardinalidade de leech

O classificador MUST rejeitar a partição inteira quando o overkill não sustenta a fronteira, e
MUST NOT expressar essa rejeição como contradição de um `N_leech` dentro de
`observedLeechAcceptsN`. A premissa mecânica é verdadeira — em overkill o dano exibido é
truncado e o leech incide sobre o dano real cheio (D-019), logo `leechDamageBasis(hit)` acima do
`Dreal_max` reconstruído por D-025 é impossível — mas contradizer `N` ali dentro **não** elimina
a partição: o motor escapa para um `N` maior inserindo hit virtual (S-014e).

Medição que estabelece o requisito: implementada como contradição de canal, a mudança produziu
**42 turnos com hits virtuais fabricados** contra 5 reclassificações reais, e quebrou
`barrage 18:59:58`. Nem o gabarito curado nem a varredura de invariantes detectaram 41 das 42
fabricações — quem pegou foi a revisão hit-a-hit do diff.

#### Scenario: Hipótese de N cujo intervalo reconstruído não alcança o dano exibido

- **WHEN** um hit de overkill com leech utilizável tem `leechDamageBasis` acima do `Dreal_max`
  reconstruído para o `N` testado
- **THEN** `observedLeechAcceptsN` MUST manter o resultado `capped_low`/neutro
- **AND** a rejeição da partição MUST vir da validação de fronteira, não do canal de leech

#### Scenario: Leech abaixo do esperado por cap continua neutro

- **WHEN** um hit tem leech observado menor que o esperado para o `N` testado, por cap de HP
  ou mana cheios
- **THEN** o resultado MUST permanecer `capped_low`/neutro
- **AND** MUST NOT contar como contradição

### Requirement: XP só prova kill através de uma sequência causal contínua

O Unified SHALL usar uma linha de XP como evidência de overkill de hit ou kill
por charm somente quando a relação permanecer contínua na ordem integral das
linhas timestampadas do Server Log. Sublinha explicitamente transparente pela
regra de associação vigente pode ser ignorada; outra ação explícita do jogador
omitida do vetor de eventos SHALL tornar a autoria do XP desconhecida.
Dano recebido (`You lose N hitpoints` ou `You lose N mana`, com ou sem atacante
nomeado) entre o candidato e a XP SHALL romper a continuidade, em qualquer log,
solo ou party, tanto para `hit → XP` quanto para `charm → XP`. Notificação de
estado do mundo SHALL NOT bloquear sozinha. Ausência de autoria SHALL NOT ser
convertida em `overkill` nem `killedTarget` (C-003, D-006, D-011 e D-012).

#### Scenario: XP contíguo preserva overkill

- **WHEN** um hit é seguido apenas pelas sublinhas transparentes aceitas pelo
  parser e então por XP dentro da janela vigente
- **THEN** o hit SHALL continuar marcado como overkill

#### Scenario: Ação explícita intermediária bloqueia overkill

- **WHEN** existe uso de poção entre o hit e o XP
- **THEN** o hit SHALL NOT ser marcado como overkill por essa linha de XP

#### Scenario: XP contíguo preserva kill por charm

- **WHEN** um proc de charm é seguido apenas pelas sublinhas transparentes
  aceitas pelo parser e então por XP dentro da janela vigente
- **THEN** o charm SHALL continuar marcado com `killedTarget = true`

#### Scenario: Ação explícita intermediária bloqueia kill por charm

- **WHEN** existe uso de poção entre o charm e o XP
- **THEN** o charm SHALL NOT receber `killedTarget = true` por essa linha de XP

#### Scenario: Notificação intermediária preserva kill por charm

- **WHEN** uma notificação de estado do mundo aparece entre o charm e o XP sem
  outra ação explícita do jogador e sem dano recebido
- **THEN** o charm SHALL continuar elegível para `killedTarget = true`

#### Scenario: jaded seq 3894 não herda XP posterior

- **WHEN** a sessão `jaded S7`, salva em `10/Jun/2026`, é classificada no turno
  `21:01:52`
- **THEN** o hit `seq 3894`, `mycobiontic beetle 825`, SHALL permanecer na
  Divine Caldera com `overkill = false`
- **AND** o turno SHALL permanecer `A8 S7 G7`

#### Scenario: Dano recebido entre o hit e a XP rompe a autoria (party)

- **WHEN** a sessão `jaded S7` (salva em `10/Jun/2026`) traz, em `19:59:49`,
  `sopping corpus 208` (vida 21, mana 7), depois duas linhas `You lose N
  hitpoints due to an attack by an oozing corpus`, depois XP
- **THEN** o `208` SHALL ter `overkill = false`
- **AND** o turno SHALL resolver `A10 S11` (o `208` é auto ataque pelo leech
  dos AAs no mesmo mob)

#### Scenario: Dano recebido sem atacante também rompe

- **WHEN** a sessão `mazzerinbarrage S4` (salva em `09/Jun/2026`) traz, em
  `23:25:45`, `darklight striker 2404` (crítico), depois `You lose 572
  hitpoints.`, depois XP
- **THEN** o `2404` (seq 5875) SHALL ter `overkill = false`

#### Scenario: Dano recebido entre o charm e a XP: o charm não matou

- **WHEN** a sessão `hakka S15` (salva em `11/Jun/2026`) traz, em `22:17:35`,
  `rootthing bug tracker 639 (curse charm)`, depois `You lose 338 mana due to an
  attack by a rootthing bug tracker`, depois XP
- **THEN** o charm SHALL ter `killedTarget = false` e nenhum auto ataque
  virtual SHALL ser criado para ele
- **AND** o turno SHALL resolver `A0 R14` (Great Fireball)

### Requirement: Charm que mata fica com a XP

O Unified SHALL atribuir a XP ao charm, e NÃO SHALL marcar o hit anterior como overkill por
ela, quando um proc de charm aparece entre um hit e uma linha de XP e o próprio charm é seguido
por essa XP pela sequência causal vigente (`killedTarget = true`). O charm entra antes do hit do
ataque que o disparou, então ele pertence ao ataque seguinte e não à cadeia do hit anterior.
Charm que não é seguido por XP continua transparente para `hit → XP`, com qualquer nome de
mob. O hit virtual de dano 0 do alvo morto pelo charm (S-014e/C-008) SHALL ser preservado.

#### Scenario: tom 3 10:00:15

- **GIVEN** `tom 3` S0 `09/Sep/2026`: `skirmisher 837` (mana 120), então
  `skirmisher 4 (overpower charm)`, então XP, então `skirmisher 1298` e `skirmisher 1479`, cada
  um seguido de XP, com cast `exori amp kor` em `10:00:15`
- **WHEN** o passe de overkill roda
- **THEN** o 837 tem `overkill = false` e o overpower tem `killedTarget = true`
- **AND** o turno resolve `A1 + Executioner's Throw 3` (1298, 1479 e o virtual 0)

#### Scenario: Charm sem kill continua transparente

- **WHEN** um hit é seguido por um charm que não é seguido por XP e depois por XP do hit
- **THEN** o hit SHALL continuar marcado como overkill

### Requirement: Reflection ou field em mob de outro nome rompe a autoria da XP

O parser SHALL interromper a busca do próximo evento relevante depois de um hit num proc de
`damage reflection` ou dano de field (M-038) cujo mob normalizado é diferente do mob do hit: a XP
seguinte NÃO SHALL marcar esse hit como overkill. Na busca depois de um charm, dano de field em
mob de outro nome SHALL interromper do mesmo jeito, e o charm NÃO SHALL receber `killedTarget`.
O proc NÃO SHALL ganhar `killedTarget` nem hit virtual. Mob com o mesmo nome normalizado SHALL
conservar o tratamento vigente, sem inferir identidade de instância. A janela de até 1 segundo e
as barreiras vigentes (poção, dano recebido) SHALL continuar valendo.

#### Scenario: Reflection em outro mob, sem mais nada no meio

- **WHEN** um hit em `rat` é seguido por `damage reflection` em `cave rat` e então por XP no
  mesmo segundo
- **THEN** o hit SHALL NOT ser marcado como overkill
- **AND** com reflection em `rat` (mesmo nome) o hit SHALL continuar overkill

#### Scenario: Reflection no skirmisher não deixa o marksman em overkill

- **WHEN** `tom` S0 (sem data) traz `raubritter marksman 2681` (vida 190, sem linha de mana) em
  `12:26:25` e, em `12:26:26`, reflection em marksman, duas linhas de dano recebido, reflection
  em `raubritter skirmisher` e XP
- **THEN** o `2681` (seq 895) SHALL ter `overkill = false` (pela reflection em outro mob; o dano
  recebido também rompe)
- **AND** o turno SHALL continuar `A1 S4`

#### Scenario: Reflection em outro mob muda a contagem

- **WHEN** `picture` S0 (sem data, party) traz, em `20:43:54`, `emerald tortoise 252` (vida 70,
  mana 45), reflection em `gore horn`, duas linhas de dano recebido e XP
- **THEN** o `252` (seq 1037) SHALL ter `overkill = false`
- **AND** o turno SHALL resolver `A1 S5` (o `252` declara `N = 1` pelo leech, H-005e)

#### Scenario: Field em outro mob rompe charm → XP

- **WHEN** um charm em `rat` é seguido por dano de field em `cave rat` e então por XP
- **THEN** o charm SHALL NOT receber `killedTarget`

#### Scenario: Mesmo nome mantém a semântica existente

- **WHEN** um reflection ou field antes da XP tem o mesmo nome normalizado do mob do candidato e
  nenhuma barreira vigente é encontrada
- **THEN** o parser SHALL conservar o comportamento atual dessa sequência
- **AND** SHALL NOT inferir identificadores de instância a partir da igualdade de nome

#### Scenario: XP do skirmisher não torna chastener overkill

- **WHEN** `tom 2 S0` (sem data) `13:04:16` traz chastener 1260 seq6103, leech 190/61,
  overpower charm skirmisher 59 seq6106 e XP
- **THEN** o chastener SHALL ter `overkill = false` e NÃO SHALL ser promovido a `amped`
- **AND** o charm SHALL conservar `killedTarget = true`
- **AND** o resultado SHALL conservar A1 S4 com o virtual legítimo do skirmisher

#### Scenario: XP fora da janela continua inválida

- **WHEN** XP vem mais de 1 segundo após o candidato
- **THEN** o parser SHALL NOT atribuir overkill ou killedTarget por essa XP, mesmo sem proc de
  outro mob

### Requirement: Golpe do blast com eco na metade exata não é overkill

Na prova de estágio do Death Echo (M-016d-1), um hit da janela do blast marcado overkill SHALL
perder a marca quando o primeiro segundo candidato do eco que tem hit não-overkill traz, depois
dele na ordem do log, um hit do mesmo mob normalizado e do mesmo estado elemental cujo dano
mostrado é a metade do dano mostrado do blast, com diferença de no máximo 1. O eco pode estar
marcado overkill; ele continua marcado. "A XP caiu entre o blast e o eco" sozinho NÃO SHALL
desmarcar nada. A desmarcação SHALL acontecer depois da prova de estágio do mesmo cast (o rótulo
de estágio desse cast sai das marcas de antes), ainda na formação de turnos, de modo que toda
inferência de setup que roda depois dela, a estimativa de taxa (C-006) inclusive, veja o hit
desmarcado. As inferências que a prova de estágio usa (estância, death pierce da arma, omega,
crítico de partida) rodam antes dela e NÃO SHALL ver a desmarcação.

#### Scenario: ms devoted 03:06:25 fica blast 2 / eco 1

- **WHEN** `ms devoted` S1 (salva em `20/Out/2026`) traz o `exevo mort ora` de `03:06:25`, blast
  `devoted radiant zealot 1424` e `devoted radiant templar 1349` (seguido de XP em `03:06:26`) e
  eco `devoted radiant templar 674` em `03:06:26`
- **THEN** o `1349` (seq 1832) SHALL ter `overkill = false`
- **AND** o turno SHALL resolver `A0 + Death Echo 3`, com 2 hits de blast e 1 de eco

#### Scenario: Os 57 golpes do corpus

- **WHEN** as sessões com Death Echo do dono são classificadas
- **THEN** exatamente os 57 golpes de blast listados em
  `reports/fix-xp-attribution-fase2/echo-list-HEAD.json` (`ms devoted` 28, `dlc ms` 20, `kim` 8,
  `italian` 1) SHALL perder a marca por esta regra
- **AND** nenhum turno dessas sessões SHALL mudar de contagem por ela

#### Scenario: XP entre blast e eco sem metade exata não desmarca

- **WHEN** um hit do blast marcado overkill tem a XP antes do eco e o eco do mesmo mob não está
  na metade exata do dano mostrado (ex.: `alumnishocks 2` `18:21:52`, `wardragon 68`)
- **THEN** o hit SHALL continuar marcado overkill
