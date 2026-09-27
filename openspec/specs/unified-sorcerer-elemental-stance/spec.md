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
observado** de cada cast ofensivo de magia: o elemento cuja reversão canônica (`D-010a`, mesma
tolerância de `elementalBlockTolerance`) faz **mobs distintos** do mesmo segundo fecharem num nível
só. Cast cujo dano não discrimina (um mob só por segundo, ou todas as candidatas fecham) não vota;
beam não vota (central e side são dois níveis legítimos, M-035).

A inferência SHALL rodar **antes** da resolução de turno, sobre os hits principais **brutos** do
segundo do cast e do seguinte (`[cast, cast+1]`), sem depender de partição nem de turno resolvido.
Quando essa janela inteira não discrimina, o motor SHALL repetir a observação sem o **primeiro**
hit da janela (em ordem de `seq`), porque só ele pode ser o auto ataque do ciclo (V-011, M-032);
nenhum outro hit é descartado.

A estância SHALL ser adotada quando uma única candidata não tiver nenhuma contradição e as demais
tiverem pelo menos uma. Fora disso o trecho SHALL ficar `unknown` (D-006), sem herdar de outra
sessão.

A estância e o estado de cada cast SHALL ser inferidos **uma vez** por sessão. Depois da
resolução, o motor SHALL apenas selar a marca de cada cast (`provada` / `vetada`) com o elemento
observado do bloco resolvido, sem reinferir a estância nem os estados.

#### Scenario: sessões com evidência discriminante

- **WHEN** as sessões pós-update de sorcerer do corpus são classificadas
- **THEN** a estância SHALL ser `energy` em `alumnishocks` S0, `alumnishocks 2` S0, `kim` S0 e
  `aquatic` S0, S1 e S2, e `death` em `death echo` S0, todas com fonte `inferred_from_damage`

#### Scenario: a inferência bruta reproduz a inferência pós-resolução anterior

- **WHEN** as 9 sessões de sorcerer pós-update (`alumnishocks` S0, `alumnishocks 2` S0, `kim` S0,
  `aquatic` S0–S2, `death echo` S0, `dlc ms` S0/S1) são classificadas
- **THEN** a estância e o estado de **cada** cast SHALL ser iguais aos que a inferência
  pós-resolução dava antes desta mudança

#### Scenario: o auto ataque não tira o voto do cast

- **WHEN** em `alumnishocks` S0 o Hell's Core de `19:01:38` tem como primeiro hit do segundo o AA
  `mega dragon 102`, e o resto do segundo fecha em energy entre mobs distintos
- **THEN** a observação SHALL ser repetida sem o primeiro hit, o cast SHALL votar `energy`, e a
  estância da sessão SHALL ser `energy`, não `unknown`

### Requirement: O elemento efetivo reverte o dano das spells de sorcerer que não são beam

Para cada cast ofensivo de magia do dono com estância conhecida, o motor SHALL reverter o dano
do bloco da spell (D-010a) no **elemento efetivo** previsto pela máquina de conversão, e não no
elemento do perfil:

- `converted` → primeiro a estância, depois o nativo;
- `arm` / `rearm` → só a estância (que é o próprio elemento da magia);
- `native` ou carga desconhecida (`unknown`) → primeiro o nativo, depois a estância.

O segundo elemento SHALL ser usado **só** quando o primeiro não fecha entre mobs distintos do
mesmo segundo e o segundo fecha (o mesmo critério de M-043a). Quando o dano não separa os dois, ou
nenhum fecha, vale o primeiro. Um terceiro elemento MUST NOT ser usado.

Com estância `unknown`, `not_applicable` (sessão anterior a 16/Jun/2026), ou vocação diferente de
sorcerer, o elemento SHALL ser o do perfil, como antes desta mudança.

Beams (`exevo vis lux`, `exevo gran vis lux`, `exevo max mort`) MUST NOT passar por este leitor
nesta versão: o elemento do beam continua sendo escolhido por `validateBeamSublineBlock`.

#### Scenario: Death Echo convertido reverte em energy

- **WHEN** `alumnishocks 2` S0 (`21/Sep/2026`, estância `energy`) é classificada e o Death Echo de
  `18:25:47` está `converted`
- **THEN** o bloco SHALL ser revertido em `energy` (blast `786/788`, eco `393/394`) e o turno SHALL
  continuar `A0 + Death Echo 15`

#### Scenario: fora de sorcerer pós-update nada muda

- **WHEN** `Mrowdy`, `Mrowdy 2` e `ms boss` (sorcerer, pré-update), `uhax 3` e `ingol ed` (druid)
  e `barrage` (paladin) são classificados
- **THEN** todos os turnos SHALL sair idênticos aos de antes desta mudança

#### Scenario: beam não muda nesta versão

- **WHEN** o corpus é classificado com esta mudança
- **THEN** nenhum beam SHALL mudar de elemento, de validação ou de rótulo `central`/`side` por
  causa deste leitor
