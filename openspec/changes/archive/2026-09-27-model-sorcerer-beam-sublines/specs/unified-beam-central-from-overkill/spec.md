## ADDED Requirements

### Requirement: O dano real de um overkill só é provado por leech que não foi cortado

Para usar o nível de dano de um hit em overkill numa sub-linha de beam, o motor SHALL exigir
**dano real provado** pelo leech absoluto (D-019/D-025). O dano real é provado quando vale uma das
condições abaixo:

- **vida e mana concordam**: os dois canais reconstroem um mesmo dano real, com a tolerância de
  leech de D-024. Os caps de vida e de mana são independentes, então dois canais concordando
  provam que nenhum foi cortado;
- **a reserva não encheu**: num canal sozinho, **todo** hit principal seguinte do mesmo golpe
  (ao menos um; sem hit virtual nem dodge) ainda ganhou aquele recurso, e **nenhuma** perda desse
  recurso aparece no server log entre o overkill e esses hits. A perda pode ser dano recebido na
  vida ou perda de mana pelo magic shield. Se a reserva estivesse cheia depois do overkill, o hit
  seguinte não ganharia nada.

Fora dessas condições, o leech do overkill MUST NOT fixar nível: ele só dá **piso**.

#### Scenario: vida e mana concordam

- **WHEN** em `alumnishocks 2` S0 18:26:16 o `wardragon 175 OK` tem vida `699` e mana `422`, com
  vida 27% + Vampiric 3,2% e mana 18,25%
- **THEN** os dois canais SHALL reconstruir dano real `≈ 2312` com `N = 1`, e o dano real SHALL
  ser considerado provado

#### Scenario: um canal sozinho, com a reserva que não encheu

- **WHEN** em `alumnishocks 2` S0 18:31:42 o `mega dragon 1334 OK` tem vida `200` (igual ao dano
  que o personagem acabou de receber, portanto capada) e mana `297`, e os três hits seguintes do
  beam ganham mana `36`, `35`, `35` sem perda de mana no meio
- **THEN** a mana SHALL provar o dano real do `1334 OK`, e a vida MUST NOT entrar na prova

#### Scenario: reserva que encheu não prova

- **WHEN** em `kim` S0 16:15:56 o `nighthunter 323 OK` tem mana `261`, o hit seguinte ganha `176`
  e os demais hits do golpe não ganham mana
- **THEN** o `323 OK` MUST NOT ter dano real provado
- **AND** o turno SHALL continuar `A0 + Great Energy Beam 7`, sem sub-linha

#### Scenario: perda de recurso no meio desfaz a prova

- **WHEN** um overkill ganha mana, uma linha `You lose N mana due to an attack` aparece antes do
  hit seguinte do mesmo golpe, e esse hit ganha mana
- **THEN** a mana MUST NOT provar o dano real do overkill

### Requirement: O central que só aparece em overkill tem o nível pelo dano real provado

O motor SHALL tratar todas as âncoras como laterais quando os hits não-overkill de um beam (as
âncoras) formam **um nível só** no elemento do beam. O nível do central SHALL sair do dano real
provado dos overkills atribuídos ao central, revertido (D-010a) no elemento do beam. Só contam os
overkills do mesmo estado de crítico, Low Blow, Savage Blow e Onslaught de alguma âncora. Todo
overkill com leech desse estado posto no central MUST ter o dano real provado; um sem prova MUST
NOT ser central nessa distribuição. Pelo menos um overkill provado MUST estar no central, e a
fração entre os níveis MUST fechar num par de stage de M-035. O motor MUST NOT supor um central sem
essa prova.

#### Scenario: overkill com leech sem prova não entra no central

- **WHEN** `dlc ms` S0 21:42:47 tem `1523 OK` (vida `520` e mana `290` concordam) e `2950 OK`
  (vida `164`, mana `4`, sem prova), do mesmo estado das âncoras
- **THEN** nenhuma distribuição de forma A MUST pôr o `2950 OK` no central
- **AND** o turno SHALL continuar `A0 + Great Death Beam 10`, sem sub-linha

Este é o caso **forma A** da Fase 1. Até esta mudança ele só fechava num elemento errado, por
coincidência.

#### Scenario: forma A de stage 1

- **WHEN** `alumnishocks 2` S0 18:26:16 (estância energy, stage 1) é classificado
- **THEN** o beam SHALL validar em `energy`, stage 1, com fração `≈ 0,2955` (lateral com 3 alvos ou
  mais, central com 1)
- **AND** `175 OK` SHALL ser `central`, e `91 OK`, `653`, `653`, `684`, `684` SHALL ser `side`

#### Scenario: central com dois overkills

- **WHEN** `alumnishocks 2` S0 18:31:29 é classificado
- **THEN** `1560 OK` e `1622 OK` SHALL ser `central` (`N = 2`), e `466`, `445`, `466`, `445`
  SHALL ser `side` (`N = 4`)
- **AND** o turno SHALL continuar `A1 + Great Energy Beam 6`

#### Scenario: os outros beams de forma A do Alumni Shocks

- **WHEN** os turnos `alumnishocks 2` S0 18:22:39, 18:25:35, 18:27:45, 18:28:09, 18:30:11, 18:31:14
  e 18:31:42 são classificados
- **THEN** cada beam SHALL validar em `energy`, stage 1, com central e lateral iguais aos da tabela
  "Mesma família" de `reports/beam-subline-central-overkill-fase1.md`

#### Scenario: um nível só, sem overkill provado no central

- **WHEN** `alumnishocks 2` S0 18:31:58 tem os quatro hits no mesmo nível em energy e o `361 OK`
  tem o mesmo leech dos `537`
- **THEN** o beam MUST NOT ter sub-linha, e nenhum hit SHALL receber `side`

### Requirement: Todo overkill provado cai no nível da sua sub-linha

O dano real provado de cada overkill SHALL cair no nível da sub-linha em que ele foi posto numa
distribuição candidata de central e lateral, revertido no elemento do beam e com a tolerância de
cluster elemental. Uma distribuição que põe um overkill provado fora do nível da sua sub-linha
MUST ser rejeitada. A comparação só vale contra âncoras do mesmo estado de crítico, Low Blow,
Savage Blow e Onslaught do overkill. Contra estado diferente, o overkill não vota: a reversão entre
estados depende do multiplicador de crítico inferido, e Savage Blow não tem normalização (D-008a).

#### Scenario: o overkill com o leech do central vai para o central

- **WHEN** em `aquatic` S2 13:05:51 o `quara raider 763 OK` (vida `476`, mana `330`) tem o leech
  dos `4394` centrais
- **THEN** `763 OK` SHALL ser `central` (`N = 3`)
- **AND** `2376 OK`, `2509`, `2606`, `2606`, `3077`, `3077` SHALL ser `side`, pela cardinalidade
  que sobra

#### Scenario: estado diferente não vota

- **WHEN** em `aquatic` S0 10:44:52 as âncoras são não-críticas e os overkills são críticos com Low
  Blow
- **THEN** o nível desses overkills MUST NOT ser comparado com o das âncoras
- **AND** o beam SHALL continuar validado em `energy`, stage 3

### Requirement: O piso de um overkill exclui as sub-linhas abaixo dele

O motor SHALL usar o piso de um overkill para excluir sub-linhas. O dano exibido de um overkill
(truncado) e o dano que o leech observado implica só podem subestimar o dano real (D-011/D-025;
capped-low, V-014). O maior desses pisos, revertido no
elemento do beam, SHALL ser comparado com cada sub-linha. Um overkill cujo piso passa do nível de
uma sub-linha, mais a tolerância, MUST NOT ser posto nela. O piso não exige prova de não-capado e
nunca confirma nível: ele só exclui. Vale a mesma restrição de estado de crítico do requisito
anterior.

#### Scenario: dano exibido acima do lateral

- **WHEN** em `kim` S0 16:15:34 o `sulphider 1856 OK` reverte o dano exibido para `1537` em energy,
  acima do lateral `≈ 1500`
- **THEN** `1856 OK` SHALL ser `central`

#### Scenario: leech que só dá piso ainda exclui

- **WHEN** em `dlc ms` S1 21:53:29 o `darklight striker 1971 OK` tem vida e mana que não concordam,
  mas a mana `420`, com `N` de lateral, implica um dano real muito acima do lateral
- **THEN** `1971 OK` MUST NOT ser `side`

### Requirement: O N da sub-linha conta os hits virtuais de charm-kill

Ao reconstruir o dano real de um overkill para verificar o nível, o motor SHALL admitir como `N`
da sub-linha a contagem dos hits dela mais até o número de hits virtuais de charm-kill do bloco
(S-014e). O hit virtual entra na cardinalidade do componente, embora não esteja na lista de hits
que o validador enxerga.

#### Scenario: lateral com um charm-kill

- **WHEN** em `dlc ms` S0 21:37:37 o lateral tem 8 hits visíveis, um `darklight striker` morto por
  charm, e o `walking pillar 488 OK` tem mana `140`, igual à do `walking pillar 5060` lateral
- **THEN** a verificação de nível SHALL usar `N = 9` e o beam SHALL continuar validado em fire,
  stage 3
- **AND** o turno SHALL continuar `A0 + Great Death Beam 11`
