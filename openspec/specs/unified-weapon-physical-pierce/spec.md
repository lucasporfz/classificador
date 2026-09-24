# unified-weapon-physical-pierce Specification

## Purpose
TBD - created by archiving change infer-weapon-physical-pierce-per-session. Update Purpose after archive.
## Requirements
### Requirement: O perk de pierce físico da arma é fato do personagem por sessão

O motor SHALL modelar um bônus de **pierce físico** vindo da arma, aditivo ao pierce do eixo
físico antes de `effectiveMod`, junto de Expose Weakness (`+0,08`), elemental amplification
(`+0,16`) e Battle Momentum (`context.bmPierce`).

O perk SHALL ser inferido **por sessão**. Nenhuma constante global SHALL aplicá-lo a todo o
corpus: medido, um `+9%` físico global degrada `darklight rp` de 1 para 10 turnos sem
classificação.

#### Scenario: pierce total de um hit com Expose Weakness

- **WHEN** a sessão tem o perk em `0,09`, o BM ativo em `0,04`, e o hit carrega Expose Weakness
- **THEN** o pierce físico do hit SHALL ser `0,21`, e o mod efetivo SHALL sair de
  `effectiveMod(physicalDmgMod, 0.21)`

### Requirement: O pierce da arma não alcança o dano de charm

O pierce da arma SHALL entrar em `pierceForElement` **somente** para hits reais de dano. As
testemunhas de charm — que chamam `pierceForElement` com um literal
`{ exposeWeakness, elementalAmplification }` — MUST NOT recebê-lo.

Esta é a distinção observável entre o perk e o Battle Momentum: o charm testemunha o BM e não
testemunha o perk.

#### Scenario: testemunha física de charm permanece exata

- **WHEN** a sessão `moonsilver` é classificada com o perk em `0,09`
- **THEN** o dano de charm `wound` do `mycobiontic beetle` SHALL continuar batendo com o modelo
  em ratio `0,9998` (com Expose Weakness) e `1,0000` (sem), e a detecção de BM SHALL continuar
  `confirmed_by_charm_damage` em `0,04`

### Requirement: A inferência usa a margem da interseção física e escolhe tier único

O detector SHALL avaliar os tiers `[0, 0.09]` sobre os blocos de AA elegíveis de uma resolução
já feita, recalculando apenas `physicalOriginalInterval` — MUST NOT reclassificar a sessão por
tier.

Bloco elegível: componente `arrow` de turno resolvido com **≥ 3** hits não-overkill e
**≥ 2 mobs distintos**.

O tier selecionado SHALL ser aquele em que **nenhum** bloco elegível tem interseção física
vazia, e SHALL ser adotado **somente** se for o único tier a satisfazer isso.

O detector SHALL devolver `0` quando mais de um tier satisfaz o critério, quando nenhum
satisfaz, ou quando há menos de 3 blocos elegíveis.

#### Scenario: sessão com evidência discriminante seleciona 9%

- **WHEN** o detector roda em `moonsilver` S0
- **THEN** ele SHALL medir 21 de 90 blocos vazios em `0` e 0 de 90 em `0,09`, e SHALL
  selecionar `0,09`

#### Scenario: sessão sem poder de discriminação seleciona 0

- **WHEN** o detector roda em `gloompillar` S0, onde os dois tiers dão 0 blocos vazios
- **THEN** ele SHALL selecionar `0`, e a classificação da sessão SHALL ficar idêntica à de
  antes desta regra

### Requirement: O detector só roda em sessão de auto ataque físico

O detector MUST NOT rodar quando a vocação da sessão não for `paladin`, e MUST NOT rodar
quando `aaElement` da sessão não for `physical`. Os dois gates são necessários.

O perk é equipamento de Royal Paladin. O gate de `aaElement` sozinho não protege as outras
vocações: para quem não é paladino, `inferAaElementForSession` devolve `physical` por
**default** (`source: 'not_paladin'`, `eligible: 0`), então o gate passa sem ter medido nada.

Sem o gate de vocação a métrica é testemunha falsa: em `alumnishocks 2` (sorcerer) os blocos
elegíveis são o 1º estágio do Death Echo (`exevo mort ora`, multiestágio M-016d-1), cujo dano
é elemental; revertidos no eixo físico, só fecham com `+0,09`, porque esse é o pierce que
alinha o único mob com `physicalDmgMod < 1,0` (dragolisk, `0,85`) aos demais.

Sem o gate de `aaElement` a métrica é ruído: em `thunder arrow` (`aaElement = energy`) 145 de
148 blocos ficam vazios em todo tier, com margens de −337 a −225.

Vocação indeterminada é abstenção (D-006), não liberação.

#### Scenario: sessão de sorcerer é ignorada pelo detector

- **WHEN** o detector é chamado na sessão `alumnishocks 2` (sorcerer, `Sept 21 2026`), cujos
  blocos elegíveis são estágios de Death Echo
- **THEN** ele SHALL devolver `0` sem avaliar bloco nenhum, e a sessão SHALL manter as mesmas
  classificações de turno que tinha com `0,09`

#### Scenario: sessão de Royal Paladin continua avaliada

- **WHEN** o detector é chamado em `moonsilver` S0 (Royal Paladin, `aaElement` físico)
- **THEN** ele SHALL avaliar os tiers normalmente e SHALL selecionar `0,09`

#### Scenario: sessão de AA elemental é ignorada pelo detector

- **WHEN** o detector é chamado numa sessão cujo `aaElement` é `energy`
- **THEN** ele SHALL devolver `0` sem avaliar bloco nenhum

