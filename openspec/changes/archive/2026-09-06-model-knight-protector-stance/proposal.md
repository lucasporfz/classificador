## Why

Quem olha a rotação de um knight na UI hoje vê **um** número de dano base onde o jogo
produziu **três**. O knight alterna entre três posturas ao longo da caçada — Protector
(`utamo tempo`, −15% de dano causado), Blood Rage (`utito tempo`, +25% de skill de
sword/axe/club) e a postura neutra (nenhuma das duas, alcançada ao recastar `utamo tempo`) —
e o motor não modela nenhuma delas. Medido em `picture` (194 turnos: 45% Protector, 10%
neutra, 45% Blood Rage), o mesmo `Fierce Berserk` não-crítico no mesmo sabretooth sai `1.020`
sob Protector, `1.159` na neutra e `1.452` sob Blood Rage — um intervalo de 47% achatado numa
média só.

O dano é o sintoma visível; o defeito real é no leech. O `−15%` do Protector é multiplicador
plano aplicado **depois** da conta de leech: o leech continua sendo creditado sobre o dano
cheio. Sem modelar isso, a taxa de leech inferida da sessão é um meio-termo entre dois
regimes que diferem 17,6% na razão leech/dano, e essa taxa é o que alimenta `N_leech`,
`H-005e` e os vetos de cardinalidade — que decidem 39 dos 52 turnos sem auto-ataque do
`picture`. A prova é direta: **as 4 contradições da taxa de vida do `picture` estão todas em
Protector (4 de 4), e as 5 contradições da taxa de mana do `ek boss` também (5 de 5)**.

## What Changes

- **Nova mecânica de domínio: postura de knight**, com três estados e uma máquina de estados
  dirigida pelos casts do Local Chat do **dono do log**, com casamento **exato** de
  `utamo tempo` e `utito tempo` (`utamo tempo san` e `utito tempo san` são spells de paladino
  e não participam).
- **Protector passa a ser modelado** como `×0,85` pós-mitigação — o mesmo ponto de prey,
  `utevo grav san` e bônus de classe de bestiário (`postMultiplier`) — **e** como divisor da
  base de leech (`leechDamageBasis`), exatamente o par que `D-030` já usa para
  `utevo grav san`.
- **Blood Rage fica declarado e não revertido.** O `+25%` vem da skill, então o dano maior é
  o dano real e o leech sobe junto — não há multiplicador a remover. O medido foi `+25,54%`
  contra `+25%` nominal, e essa sobra de `0,4%` é da ordem da tolerância de exatidão
  same-mob (`S-004a`): revertê-la quebraria bloco em vez de corrigir métrica. Mesmo
  tratamento que `M-037` dá ao decay de Chained Penance.
- **A troca de postura vale a partir do segundo SEGUINTE ao cast.** Dentro do mesmo segundo
  não há ordem observável entre a fala do Local Chat e o hit do Server Log; as duas únicas
  observações do corpus que discriminam apontam para a postura antiga.
- **Postura inicial desconhecida é abstenção, não chute.** Enquanto nenhum cast de postura
  do dono tiver sido observado, o hit não recebe multiplicador de postura, não vira
  testemunha de charm e não vira observação-ouro de leech (`D-006`).
- **Detector inerte onde não há postura.** Sessão sem cast exato de postura do dono não muda
  em nada — mesmo padrão de `M-035`/`M-036`/`M-039`/`M-040`.

## Capabilities

### New Capabilities
- `unified-knight-stance`: a máquina de estados de postura do knight por sessão (Protector /
  neutra / Blood Rage), a semântica de fronteira de segundo, a abstenção antes do primeiro
  cast observado, e o efeito do Protector nos dois pontos da fórmula (multiplicador
  pós-mitigação e divisor da base de leech).

### Modified Capabilities
- `unified-leech-base-inference`: a base de dano das observações-ouro passa a descontar o
  Protector; hits em postura desconhecida deixam de ser observações-ouro.

## Impact

- **Motor:** `js/unified-formulas.js` (`postMultiplier`), `js/unified-setup-inference.js`
  (`leechDamageBasis`), `js/unified-classification-engine.js` (inferência de setup por
  sessão: um `stanceSetup` novo, no mesmo estilo de `gravSanSetup`).
- **Regras:** entrada nova no `docs/CLASSIFICATION_RULES.md` para a postura de knight.
- **Raio medido, casamento exato, filtrado pelo dono do log: 4 sessões de 4 fixtures** —
  `bastion` S0, `ek boss` S0, `night harpy` S0 e `picture` S0. Destas, `bastion` e
  `night harpy` **nunca lançam `utamo tempo`** (só Blood Rage, que esta change não reverte),
  então ficam byte-idênticas. O drift real fica em **`ek boss` + `picture`**, os dois do
  mesmo personagem. Os outros 37 fixtures não têm postura do dono.
- **Métrica: NÃO muda.** Decisão do usuário em 06/Set/2026, depois do code-review. A coluna
  de dano base (`preyGravSanNormalizedDamage`, `js/unified-main.js`) normaliza hoje só prey e
  `utevo grav san`, e **continua assim** — o Protector não é descontado dela. Consequência
  declarada: a linha de rotação de um knight continua sendo a média das três posturas, num
  intervalo de 47%. Medido em `picture`, `Fierce Berserk` não-crítico no mesmo sabretooth:
  `1.020` (Protector) · `1.159` (neutra) · `1.452` (Blood Rage), e a tabela mostra ≈`1.230`,
  que não corresponde a nenhum dos três. Registrado em `M-041-nota`.
- **Fora de escopo:** Combat Mastery e o falso positivo do perk de `+6%` no detector de
  omega (change própria, com medição de drift própria, porque mexe no `crypt`); a
  normalização das testemunhas de charm pela postura, que pertence àquela mesma change.
