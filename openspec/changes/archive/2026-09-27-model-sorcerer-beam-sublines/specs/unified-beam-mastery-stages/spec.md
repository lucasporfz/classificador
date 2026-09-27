## ADDED Requirements

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
