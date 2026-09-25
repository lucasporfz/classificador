# rotation-sorcerer-conversion-breakdown Specification

## Purpose
TBD - created by archiving change model-sorcerer-elemental-stance-display. Update Purpose after archive.
## Requirements
### Requirement: O resumo de sessão mostra a estância do sorcerer

Em sessão de sorcerer, o cartão de perks do resumo SHALL exibir uma linha de estância com o nome
da estância, o elemento e a fonte (cast do dono ou inferida). Estância `unknown` SHALL ser exibida
como desconhecida, nunca omitida silenciosamente nem substituída por uma estância assumida.

Em sessão de outra vocação a linha MUST NOT aparecer.

#### Scenario: sessão de sorcerer com estância inferida

- **WHEN** `alumnishocks 2` é carregada na página
- **THEN** o resumo SHALL mostrar `Master of Thunder (energy)` com a marca de inferida

#### Scenario: sessão de knight não mostra estância elemental

- **WHEN** um log de knight é carregado
- **THEN** o resumo MUST NOT exibir linha de estância elemental

### Requirement: As conversões aproveitadas e perdidas aparecem por turno e no agregado

A UI SHALL exibir, no mesmo padrão da quebra de `utevo grav san`:

- uma faixa de fundo na altura toda dos gráficos de turno, como a do grav san: verde lisa para
  a magia de outro elemento que **aproveitou** a conversão (`used`), mais clara quando só a
  sequência a sustenta, e hachurada vermelha para a que a **perdeu** (`lost`), com legenda das
  três;
- no detalhe do turno, uma pílula dizendo qual dos dois ocorreu, em que elemento o cast saiu e
  se o dano o prova, mais uma borda lateral nas linhas do cast;
- uma seção "Conversão elemental" com o aproveitamento da sessão, uma linha por magia de outro
  elemento (casts, aproveitadas e perdidas, cada uma com quantas o dano prova) e os turnos com
  conversão perdida como chips que abrem o detalhe.

As faixas SHALL aparecer assim que o resultado é exibido, sem depender de hover (escolha da
variante D do protótipo de 25/Set/2026: marcação do grav san + seção própria).

**A sequência decide a marca; o dano só reforça ou veta** (decisão do usuário): `used` é a
magia de outro elemento lançada com a carga armada, `lost` a lançada sem carga. Com bloco
mensurável (critério de M-043a), fechar no elemento previsto SHALL dar o selo "provada pelo
dano", e não fechar nele SHALL vetar a marca. Magia do elemento da estância (`arm`/`rearm`) não
perde nada e MUST NOT ser marcada.

Turno sem cast ofensivo, com estado de carga desconhecido, ou de sessão com estância `unknown`,
MUST NOT receber faixa nem chip.

#### Scenario: a sequência marca mesmo sem prova de dano

- **WHEN** em `kim` o Death Echo de `16:22:20` vem logo após o Great Energy Beam de `16:22:18` e
  acerta um mob só (o dano não discrimina o elemento)
- **THEN** o turno SHALL ser marcado como conversão aproveitada, sem o selo de prova

#### Scenario: magia do elemento da estância com carga armada não é perda

- **WHEN** em `kim` o dono casta Energy Wave em `16:13:35` com a carga armada (Master of Thunder),
  e o Death Echo de `16:13:37` fecha em energy
- **THEN** o turno `16:13:35` MUST NOT ser marcado, e o turno `16:13:37` SHALL ser marcado como
  conversão aproveitada

#### Scenario: perda provada pelo dano

- **WHEN** em `alumnishocks 2` o Death Echo de `18:30:46` fecha em death entre mobs distintos
- **THEN** o turno SHALL aparecer marcado como conversão perdida

#### Scenario: agregado da sessão

- **WHEN** `alumnishocks 2` é exibida
- **THEN** a linha agregada SHALL contar aproveitadas e perdidas provadas, e a soma das duas
  SHALL ser o total de oportunidades exibido

