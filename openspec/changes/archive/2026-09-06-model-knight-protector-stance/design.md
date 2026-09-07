## Context

O motor infere, por sessão, tudo o que é escolha de equipamento ou estado do personagem:
`gravSanSetup` (D-030), `bmPierce` (C-012/C-012a), eixo do AA (S-007b), pierce físico da arma
(M-040), bônus de classe de bestiário (M-036), omega (M-039) e o setup de leech (C-006). A
postura do knight é dessa mesma família, com uma diferença: ela **muda dentro da sessão**, e o
Local Chat registra cada troca. Não é um valor inferido por evidência estatística — é um fato
observado, e o dano só serve de confirmação.

O diagnóstico completo está em `reports/picture-diagnostico.md` (P1). As seis predições do
modelo de três posturas foram medidas e as seis bateram: charm PROT/neutra `0,850`, charm
RAGE/neutra `1,00`, hits de arma PROT/neutra `0,8365`, hits RAGE/neutra `1,2554`, leech/dano
PROT/neutra `1,1657`, leech/dano RAGE/neutra `0,9854`.

O protótipo joga-fora `tools/proto-protector-in-engine.mjs` remendou as duas funções em
memória (o `js/` não foi tocado) e mediu o efeito A/B nos dois fixtures alcançados.

## Goals / Non-Goals

**Goals:**
- Modelar o Protector nos dois pontos da fórmula em que ele age, para que a taxa de leech da
  sessão pare de ser um meio-termo entre dois regimes.
- Registrar a postura como fato observado por segundo, auditável no diagnóstico.
- Deixar inerte toda sessão sem cast exato de postura do dono.

**Non-Goals:**
- Reverter o `+25%` do Blood Rage.
- Combat Mastery e o falso positivo do detector de omega (change própria).
- Normalizar as testemunhas de dano de charm pela postura (vai junto com a change do Combat
  Mastery, que é quem mexe nessa testemunha).
- Resolver o resíduo de mana do `moonsilver sentinel` no `ek boss` (ver Riscos).

## Decisions

### 1. A linha do tempo de postura vive no setup de sessão, ao lado de `gravSanSetup`

Construída em `js/unified-classification-engine.js`, no mesmo ponto em que os outros setups
por sessão são construídos, a partir de `local.playerCasts` — que já vem filtrado pelo dono
(`selectedSpeaker`). Exposta em `context.stanceSetup`, com uma consulta por timestamp que
`js/unified-formulas.js` e `js/unified-setup-inference.js` chamam.

**Alternativa descartada — janelas com duração, como `utevo grav san` (`cast..cast+5s`):** a
postura não expira por tempo observável; ela é ligada e desligada por cast. Modelar como
janela exigiria uma duração inventada.

### 2. Casamento exato da incantação, não substring

Só `utamo tempo` e `utito tempo`, comparação de igualdade após `trim`/`toLowerCase`.

**Alternativa descartada — substring:** `utamo tempo san` e `utito tempo san` são spells de
paladino e casam por substring. Medido: a busca por substring acusa **14 fixtures**, contra os
**4** reais do casamento exato. Um paladino ganharia `−15%` de dano fantasma.

### 3. Protector entra em `postMultiplier` E no divisor de `leechDamageBasis`

Exatamente o par que `D-030` já usa para `utevo grav san`: o multiplicador infla (aqui,
reduz) o dano exibido sem mexer no leech, então ele sai da base de leech.

**Alternativa descartada — só `postMultiplier`:** contradiz a medição. Se o `−15%` estivesse
dentro da base de leech, a razão leech/dano seria igual nas duas posturas; o medido é
`1,1657`, contra `1/0,85 = 1,1765` previsto.

**Confirmação independente:** as contradições da taxa vencedora de hoje são **todas** de hits
em Protector — `4` de `4` no canal de vida do `picture`, `5` de `5` no canal de mana do
`ek boss`. E as taxas que saem com o desconto caem em pontos limpos da grade de `D-020`:
`0,25` e `0,50` de vida (1 e 2 slots de Life Leech Powerful), `0,16` de mana (os 2 slots de
Mana Leech Powerful, no teto), contra `0,285`/`0,5875`/`0,19`/`0,185` de hoje.

### 4. Blood Rage fica declarado, não revertido

Mesma disciplina de `M-037` (decay de Chained Penance): a regra declara a mecânica e o motor
não reconstrói o fator.

**Alternativa descartada — dividir por `1,25`:** o medido é `1,2554`, e a sobra de `0,4%` é da
ordem da tolerância de exatidão same-mob (`S-004a`), que decide fronteira de componente. Um
fator de skill errado por `0,4%` quebra bloco em vez de corrigir métrica. Além disso,
reverter o Blood Rage estenderia o raio da change para `bastion` (77 casts) e `night harpy`
(94 casts), que hoje ficam byte-idênticos.

**Consequência declarada:** o dano base agregado (`A-006`) do knight continua misturando
postura neutra com Blood Rage — um intervalo de 25%.

### 5. A troca vale a partir do segundo SEGUINTE ao cast

Dentro do mesmo segundo não há ordem observável entre a fala do Local Chat e a linha do
Server Log. As duas únicas observações do corpus que discriminam apontam para a postura
anterior:

- `picture` `20:47:37` (segundo de um `utito tempo`): com a troca valendo já no segundo do
  cast, sobra 1 contradição na taxa vencedora (`gorerilla`, observado `276` contra `242`
  esperado); com a troca valendo do segundo seguinte, o hit é avaliado sob Protector, o
  esperado sobe para `284` e vira capped-low — **zero** contradições nos dois canais.
- `ek boss` `19:41:37` (também segundo de um `utito tempo`): com a troca valendo já no
  segundo do cast, o turno perde o auto-ataque (`A1 S4 → A0 S5`); com a troca valendo do
  segundo seguinte, ele não muda.

### 6. Postura desconhecida é abstenção (`D-006`), não postura neutra assumida

Antes do primeiro cast exato de postura do dono, o estado é `unknown`: sem multiplicador, sem
testemunha, sem observação-ouro. Alcance medido hoje: `bastion` S0, 3 hits de 1.492, num
fixture que nunca lança `utamo tempo` — consequência prática zero.

**Alternativa descartada — assumir neutra:** é o comportamento de hoje e tem drift zero, mas
uma caçada que comece com o Protector ligado sairia com o dano `15%` menor e a conta de leech
`15%` errada, sem nenhum sintoma.

## Risks / Trade-offs

**[`ek boss` `19:39:12` passa de classificado para sem classificação]** → Aceito como
pendência declarada (decisão do usuário). Diagnóstico registrado para não se perder: o turno
é um hit único de `moonsilver sentinel` (`349`, vida `116`, mana `70`). Com o desconto do
Protector a base vira `410,6` e o esperado de mana a `N=1` cai de `67` para `66`; o observado
`70` passa a exceder a tolerância por **1 ponto**. Não é contradição estrutural: os **6** hits
que contradizem a taxa de mana nessa sessão são todos do **mesmo** mob e todos pedem a mesma
taxa efetiva `≈0,1705` contra os `0,16` do personagem — a assinatura de um `Void's Call`
de `+1,2%` em `moonsilver sentinel` (`0,172`), que faria os 6 fecharem. O detector de
`D-021a` não o encontra porque o gate turn-local exige componente com 2 mobs distintos em
turno já resolvido, e essa caçada de boss quase não tem. Contra esse 1 turno, o mesmo log
recupera **10** auto-ataques.

**[As testemunhas de dano de charm continuam sem normalização por postura]** → Sem regressão,
porque é o status quo: `M-036` já devolve `charm_evidence_inconclusive` no `picture` e
`no_elemental_charm_evidence_outside_grav_san` no `ek boss`, antes e depois. Fica declarado e
vai para a change do Combat Mastery, que é a que mexe nessa testemunha.

**[O dano base do knight continua com o viés de Combat Mastery]** → `+0` a `+6%`, média
`≈+3%`. Declarado no diagnóstico e endereçado pela change seguinte.

**[Rollback]** → O detector é inerte por construção: sessão sem cast exato de postura do dono
não muda. Reverter é remover a chamada do multiplicador nos dois pontos.

## Open Questions

- ~~**A postura expira?**~~ **Resolvida (usuário, 06/Set/2026): a postura fica ligada até o
  próximo cast, sem expiração por tempo.** O corpus não conseguia decidir — o trecho mais
  longo medido é de `3min37s` após um `utamo tempo`, e ali a predição de dano bateu. A
  máquina de estados é liga/desliga por cast, não janela com duração.
- **Recastar `utito tempo` desliga o Blood Rage?** Não observado. Irrelevante para esta
  change: o Blood Rage não é revertido, e sair dele para neutra ou permanecer nele dá o mesmo
  resultado — nos dois casos o Protector está desligado.
- **A morte do personagem reseta a postura?** Não observado no corpus.
