# unified-beam-mastery-stages Specification

## Purpose
TBD - created by archiving change pair-beam-mastery-stage-fraction-and-rate. Update Purpose after archive.
## Requirements
### Requirement: Os stages da Beam Mastery atrelam fração lateral e bônus por alvo

A Beam Mastery tem três stages, e cada um fixa **ao mesmo tempo** a fração de dano dos quadrados laterais (em relação ao beam central) e o bônus de dano por alvo atingido:

| stage | fração lateral | bônus por alvo | teto do bônus |
|---|---|---|---|
| 1 | `0,25` | `+10%` | `+30%` (3 alvos) |
| 2 | `0,40` | `+12%` | `+36%` (3 alvos) |
| 3 | `0,70` | `+14%` | `+42%` (3 alvos) |

O motor SHALL gerar as frações admissíveis de sub-linha a partir desses pares. Ele MUST
NOT combinar a fração de um stage com o bônus de outro: um cast validado com fração
`0,70` MUST usar `+14%` por alvo, e nunca `+10%` ou `+12%`.

A fração lateral MUST NOT continuar sendo constante única no código. `0,70` é o valor do
stage 3, não a mecânica inteira.

#### Scenario: Par de stage 3 permanece admissível

- **WHEN** o motor valida um cast de beam cuja razão revertida side/central é `0,7766`
  com 3 alvos na lateral e 2 no central
- **THEN** o cast SHALL fechar no stage 3 (`0,70 × 1,42 / 1,28`)
- **AND** o resultado SHALL registrar o stage escolhido junto com a taxa por alvo

#### Scenario: Par misto é rejeitado

- **WHEN** um cast só fecharia combinando fração `0,70` com bônus de `+10%` por alvo —
  `kim` `16:15:56`, razão observada `0,8252` contra `0,8273` previsto por esse par
- **THEN** esse par MUST NOT ser admissível
- **AND** o cast SHALL ser reavaliado apenas contra pares de stage íntegros, ficando sem
  tier de sub-linha se nenhum deles o explicar

#### Scenario: Stage 1 e stage 2 são reconhecíveis

- **WHEN** um cast de beam tem razão revertida side/central de `0,25` (ou `0,40`) com
  contagens iguais nas duas sub-linhas
- **THEN** o motor SHALL reconhecê-lo como sub-linha de stage 1 (ou stage 2)
- **AND** MUST NOT rejeitá-lo por não caber na família de `0,70`

### Requirement: A contagem do bônus por sub-linha é ambiguidade declarada

A tooltip da mastery diz que o bônus vale "for each target hit by **the central beam**", o que faria o bônus incidir igual nas duas sub-linhas e a razão observada ser exatamente a fração do stage. O corpus tem testemunha dos dois lados: `kim` `16:12:55` tem dois hits no mesmo mob e mesmo estado (`2011` e `1580`, razão `0,7857`) sem liberdade de partição — só explicável se cada sub-linha contar os próprios alvos (`0,70 × 1,28 / 1,14 = 0,7860`) — enquanto `dlc ms` tem dezenas de casts em `0,700` exato.

Enquanto essa ambiguidade não for resolvida por evidência nova, o motor SHALL admitir, por
stage, as duas leituras: a razão igual à fração do stage, e a razão com o bônus contado
por sub-linha com cap de 3 alvos. A regra MUST registrar a ambiguidade em vez de eliminar
uma das leituras em silêncio.

#### Scenario: Leitura cancelante continua válida

- **WHEN** um cast de beam tem razão revertida `0,700` e contagens diferentes nas duas
  sub-linhas — padrão dominante em `dlc ms`
- **THEN** o cast SHALL permanecer validado
- **AND** MUST NOT perder os marcadores `beamSide` por causa da contagem

#### Scenario: Leitura por sub-linha continua válida

- **WHEN** um cast de beam tem dois hits no mesmo mob e mesmo estado, razão `0,7857`,
  sem hit adicional que permita outra partição — `kim` `16:12:55`
- **THEN** o cast SHALL fechar pela leitura por sub-linha do stage 3
- **AND** o turno MUST continuar resolvido como hoje

### Requirement: O piso da isenção same-mob sai do mínimo sobre todos os stages

O piso que `M-035a` usa para limitar a isenção de exatidão same-mob SHALL ser derivado do extremo inferior de **todos** os stages — o lateral sem bônus contra o central saturado em 3 alvos, minimizado sobre a tabela: `0,25 / (1 + 0,10 × 3) ≈ 0,192`. O motor MUST NOT manter o piso do stage 3 (`0,493`) como se fosse o mínimo da mecânica, e MUST NOT introduzir limiar independente da tabela de stages.

#### Scenario: Razão muito abaixo de qualquer stage continua sendo AA

- **WHEN** um `roaming dread` recebe `112` e `2448` no mesmo estado — `Mrowdy 2` /
  `ms boss` `17:16:37`, razão `0,046`
- **THEN** a razão MUST continuar abaixo do piso derivado
- **AND** o turno SHALL continuar resolvendo como `A1 + Great Energy Beam`

#### Scenario: Razão de stage baixo deixa de ser vetada

- **WHEN** um bloco same-mob tem razão `0,30`, dentro da família de stage 1
- **THEN** o motor MUST NOT tratá-la como fora da mecânica declarada apenas por estar
  abaixo do mínimo do stage 3

### Requirement: O stage da Beam Mastery é um só na sessão

O stage da Beam Mastery é fato do personagem e SHALL ser tratado como setup da sessão. O motor
SHALL inferi-lo antes da passada final, a partir dos beams cujo bloco final valida na passada sem
leech. Os que contam são os **discriminantes**, isto é, os que um único stage explica. Se todos
concordam, esse é o stage da sessão e o validador de sub-linhas SHALL testar só os pares dele.
Sem beam discriminante, ou com discordância, o stage SHALL ficar desconhecido (D-006) e os três
stages SHALL continuar admitidos, como antes desta mudança. O stage MUST NOT ser herdado de outra
sessão.

#### Scenario: Alumni Shocks é stage 1

- **WHEN** `alumnishocks` S0 e `alumnishocks 2` S0 são classificadas
- **THEN** o stage da sessão SHALL ser 1 nas duas (5 e 44 beams discriminantes, todos em stage 1)
- **AND** nenhum beam das duas sessões SHALL validar em stage 3

#### Scenario: os outros sorcerers são stage 3

- **WHEN** `kim` S0, `dlc ms` S0 e S1, `aquatic` S0, S1 e S2 e `death echo` S0 são classificadas
- **THEN** o stage da sessão SHALL ser 3 em todas

#### Scenario: sem beam validado, o stage fica desconhecido

- **WHEN** uma sessão não tem nenhum beam discriminante (os sorcerers pré-cutoff do corpus)
- **THEN** o stage SHALL ficar desconhecido e a classificação SHALL ser a mesma de antes desta
  mudança
