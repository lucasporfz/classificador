# unified-sorcerer-elemental-stance Specification

## Purpose
TBD - created by archiving change model-sorcerer-elemental-stance-display. Update Purpose after archive.
## Requirements
### Requirement: A estância elemental do sorcerer é fato da sessão, com três estados

O motor SHALL modelar três estâncias de sorcerer, cada uma com seu elemento e sua incantação:
`uteta flam` = Master of Flames (`fire`), `uteta mort` = Master of Decay (`death`),
`uteta vis` = Master of Thunder (`energy`).

A estância **não expira**: o jogador fica com ela até lançar outra. Por isso ela é lida como uma
linha do tempo de casts **exatos** do dono do log (`selectedSpeaker`) — cast de outro jogador da
party MUST NOT trocar a estância, no mesmo critério de M-041.

Sem cast `uteta` do dono na sessão, a estância SHALL ser **constante na sessão inteira** (uma
troca exigiria um cast, que apareceria no chat) e SHALL ser inferida pelo dano (M-043a). Com cast
do dono, o trecho **anterior** ao primeiro cast SHALL ser inferido pelo dano como se fosse uma
sessão à parte, e cada trecho seguinte SHALL usar a estância do cast que o abre.

A estância MUST NOT ser herdada de outra sessão, nem do mesmo personagem no mesmo arquivo.

Sessão de vocação diferente de `sorcerer` MUST NOT receber estância.

#### Scenario: estância vem do cast do dono

- **WHEN** a sessão `dlc ms` S0 é classificada, e o dono (`Nightt Gaze`) casta `uteta flam` em
  `21:20:23`
- **THEN** a estância a partir desse cast SHALL ser `fire` com fonte `owner_cast_timeline`

#### Scenario: cast de estância de outro jogador é ignorado

- **WHEN** uma sessão tem `uteta vis` no chat, lançado por alguém que não é o dono do log
- **THEN** esse cast MUST NOT entrar na linha do tempo da estância do dono

### Requirement: Antes do update de 16/Jun/2026 não existe estância

Sessão datada antes do update de **16/Jun/2026** SHALL ter estância `not_applicable`: sem
inferência, sem linha do tempo e sem marca de conversão em cast nenhum. As estâncias foram
introduzidas nesse update — a mesma data do cutoff de regime de D-016 —, então isso é fato do
regime, não abstenção.

#### Scenario: sessão pré-update

- **WHEN** `mrowdy 2` S0 (`11/Jun/2026`) é classificada
- **THEN** a estância SHALL ser `not_applicable`, e todo cast SHALL ficar sem estado de conversão

### Requirement: A conversão é uma máquina de estados sobre os casts ofensivos do dono

Com a estância `E`, o motor SHALL percorrer em ordem cronológica **todos** os casts ofensivos de
magia do dono presentes no local chat da sessão — inclusive os anteriores ao início do server
log e os de turnos sem classificação, porque todos armam ou consomem a carga — e atribuir a cada
um um estado de conversão:

- `arm` — o cast é de elemento `E` e não havia carga; passa a haver;
- `rearm` — o cast é de elemento `E` **com** carga: nada se perde, a carga segue armada;
- `converted` — o cast é de elemento diferente de `E` **com** carga: o dano sai como `E` e a carga
  é consumida;
- `native` — o cast é de elemento diferente de `E` **sem** carga: o dano sai no elemento da magia.

A carga **não expira** por tempo; só é consumida por um cast `converted`. O efeito de uma troca de
estância sobre uma carga armada não foi declarado, então depois de uma troca o estado da carga
SHALL recomeçar desconhecido, como no início do chat. Medido: em 131 conversões confirmadas pelo dano no corpus, o intervalo armar→converter
vai de 2 s a 11 s.

Antes do primeiro cast de elemento `E` observado no chat, o estado da carga é desconhecido; o
primeiro cast de elemento diferente nesse trecho SHALL ser semeado pelo **elemento observado** do
seu bloco quando mensurável (`converted` se sai em `E`, `native` se sai no próprio elemento), e
`unknown` quando não for.

Auto ataque de varinha, runa e magia utilitária MUST NOT armar nem consumir a carga. A conversão SHALL valer para todo o dano da magia convertida, inclusive o estágio atrasado
de uma spell multiestágio (M-016d).

#### Scenario: conversão consumida e depois indisponível

- **WHEN** em `alumnishocks 2` (estância `energy`) o dono casta Energy Wave em `18:30:38`,
  Hell's Core em `18:30:42` e Death Echo em `18:30:46`, sem nenhum cast de energy entre os dois
  últimos
- **THEN** o Energy Wave SHALL ficar `arm`, o Hell's Core SHALL ficar `converted` e o Death Echo
  SHALL ficar `native` — e o dano observado SHALL confirmar: o Hell's Core reverte como `energy`
  e o Death Echo reverte como `death`

#### Scenario: a carga vem de antes do server log

- **WHEN** o local chat de `alumnishocks 2` tem um Hell's Core em `18:21:21`, antes do primeiro
  turno do server log, e o primeiro turno (`18:21:25`) traz um Death Echo lançado em `18:21:26`
- **THEN** o Hell's Core SHALL consumir a carga e o Death Echo SHALL ficar `native`, com dano
  observado em `death`

### Requirement: Sem cast de estância, a estância é inferida pelo dano

Quando um trecho não tem cast `uteta` do dono, o motor SHALL inferir a estância comparando, para
cada candidata `E ∈ {fire, death, energy}`, a previsão da máquina de conversão com o **elemento
observado** de cada bloco de spell: o elemento cuja reversão canônica (`D-010a`, mesma tolerância
de `elementalBlockTolerance`) faz **mobs distintos** do mesmo segundo fecharem num nível só. Bloco
com um mob só, ou em que todas as candidatas fecham, não vota; beam não vota (central e side são
dois níveis legítimos, M-035).

A estância SHALL ser adotada quando uma única candidata não tiver nenhuma contradição e as demais
tiverem pelo menos uma. Fora disso o trecho SHALL ficar `unknown` (D-006), sem herdar de outra
sessão.

A inferência MUST NOT alterar classificação: ela roda sobre turnos já resolvidos e nenhum de seus
resultados realimenta reversão, partição ou validação de bloco.

#### Scenario: sessões com evidência discriminante

- **WHEN** as sessões pós-update de sorcerer do corpus são classificadas
- **THEN** a estância SHALL ser `energy` em `alumnishocks` S0, `alumnishocks 2` S0, `kim` S0 e
  `aquatic` S2, e `death` em `death echo` S0, todas com fonte `inferred_from_damage`

#### Scenario: sessão sem blocos que discriminem

- **WHEN** `aquatic` S1 é classificada e nenhum bloco de spell é mensurável
- **THEN** a estância SHALL ser `unknown`, mesmo que `aquatic` S2, do mesmo personagem, seja
  `energy`

#### Scenario: a inferência não muda turno nenhum

- **WHEN** o corpus inteiro é classificado com esta regra implementada
- **THEN** o dump SHALL ser byte-idêntico ao dump anterior à regra, em todos os pares

