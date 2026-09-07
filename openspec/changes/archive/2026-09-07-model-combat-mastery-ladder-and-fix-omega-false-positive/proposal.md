## Why

Quem abre a sessão `picture` na UI vê o selo **`Omega ×1.06`** num personagem que **não tem**
esse perk. O que ele tem é outro perk, o **Combat Mastery** — roda de habilidade, exclusiva de
knight, que dá `+1%` de dano a cada `14/12/10%` de vida faltante do alvo (dobrado com arma de
duas mãos). São mecânicas diferentes com assinaturas diferentes no dano de charm, e o detector
de `M-039` confunde as duas porque procura *"existe um nível a ~1,06 do ancorado"* medindo
**distância ao valor** — tolerância que aceita razões de `1,0466` a `1,0733`.

Medido: em `picture` S0 a linha-testemunha `sabretooth | wound charm` tem os níveis
`927 · 936 · 954 · 973`. O detector ancora em `927`, encontra `973` dentro da janela de `1,06`
(`[970,3 ; 995,0]`) e crava omega — sendo a razão real `1,0496`. Os quatro níveis são degraus de
`1%` de uma escada (`0,97% · 1,92% · 1,99%` entre consecutivos), e o maior degrau da sessão
inteira é `1,0597`: com omega por cima o teto seria `1,06 × 1,06 = 1,1236`, que não aparece em
nenhum dos 5 mobs. **É falso positivo, e é mensurável que é.**

Junto vem um segundo defeito da mesma testemunha: o Protector (`utamo tempo`) reduz o dano
causado em `15%` **e isso alcança o dano de charm**, mas as três leituras que usam o charm como
testemunha (`M-039` omega, `M-036` bônus de classe de bestiário, `C-012a` pierce de Battle
Momentum) preveem o valor sem descontar a postura. Em `picture` isso mistura, na mesma linha,
procs de `819` (Protector) com procs de `927–973` (Blood Rage) como se fossem a mesma população.

## What Changes

- **Nova mecânica de domínio: Combat Mastery (`M-042`)**, escada de dano por vida faltante do
  alvo, exclusiva de knight. **Declarada e NÃO revertida**, mesma disciplina de `M-037` (decay
  de Chained Penance) e do `+25%` de Blood Rage em `M-041`: o motor não observa a vida da
  criatura, então não escolhe o degrau de um hit de arma. Consequência declarada: o dano base
  agregado (`A-006`) de um knight com o perk carrega `+0` a `+6%` (média medida `≈ +3%`).

- **A escada é detectada por sessão, no canal de testemunha de charm**, e é o discriminador que
  separa Combat Mastery de omega. Uma linha-testemunha é escada quando tem **≥3 níveis** (piso
  de `≥3` procs de `M-036`/`C-012a`/`M-039`) que caem todos numa grade `base × (1 + s·n)`, com
  `s ∈ {1%, 2%}`, `n` inteiro, e cujo span cabe no teto que `s` permite. Os tetos são
  **derivados das constantes declaradas do jogo**, não escolhidos: degrau de `1%` ⇒ até `9`
  degraus ⇒ `×1,09`; degrau de `2%` ⇒ `×1,18`.

- **Sob escada, um multiplicador uniforme da sessão é testado como TETO contra o menor nível
  observado, não como igualdade contra a mediana.** O fato mecânico é que o Combat Mastery
  **só soma, nunca subtrai**: o menor nível de uma linha-testemunha é um limite superior do
  dano sem o perk, logo um candidato de bônus de classe (`M-036`) ou de pierce (`C-012a`) é
  **eliminado** quando o previsto com ele excede esse menor nível. O veredito da classe é a
  interseção dos candidatos sobreviventes de todas as suas linhas: vazio ⇒ **sem bônus,
  provado**; exatamente um ⇒ esse bônus; mais de um ⇒ abstém (`D-006`).

  Isso mantém um knight com Combat Mastery **e** bônus de classe detectável — a classe que
  exibir o degrau zero crava o bônus —, e é medição, não precaução: corrigir só a postura, sem
  isto, faz `picture` sair de abstenção correta para um **`mammal +3,0%` falso** (a mediana de
  cada linha cai num degrau da escada), e trocar a mediana pelo menor nível dá outro falso,
  `reptile +2,0%`. Com o teto, as três classes de `picture` fecham em **sem bônus, provado**.

- **O omega continua detectável por cima da escada, pelo TETO SUPERIOR.** Omega é por-hit, não
  uniforme, então o piso não o limita — ele **estende** a escada para cima. Um nível acima do
  teto que o Combat Mastery sozinho alcança, e sobre a grade estendida `(1 + s·n) × 1,06`,
  prova o `+6%`. Caminho **declarado e sem caso no corpus atual** — mesma situação do
  Override 2 de `M-031`.

- **A postura do knight entra no estado do proc de charm** (emenda a `M-041`): a chave de
  agrupamento das testemunhas ganha a postura, e o valor previsto é multiplicado por `0,85` em
  Protector. Vale para as **três** leituras (`M-036`, `M-039`, `C-012a`).

- **`M-039` fica com o texto intacto.** Sessão sem escada — inclusive `crypt`, onde o omega foi
  calibrado — segue exatamente a regra atual.

## Capabilities

### New Capabilities

- `unified-combat-mastery-ladder`: detecção por sessão da escada de dano de Combat Mastery no
  canal de testemunha de charm; a abstenção das três leituras que consomem esse canal quando a
  escada existe; e a única via pela qual o perk omega continua provável nessa situação (nível
  acima do teto da escada).

### Modified Capabilities

- `unified-knight-stance`: a postura do knight passa a ser parte do **estado do proc de charm**
  — entra na chave de agrupamento das testemunhas e multiplica o valor previsto por `0,85` em
  Protector. Hoje a capacidade só diz que postura `unknown` invalida a testemunha; ela não diz
  o que a postura **conhecida** faz com ela.

## Impact

**Motor.** `js/unified-classification-engine.js`: novo detector de escada
(`inferCombatMasteryLadder`), consumido por `inferOmegaPerk` (`M-039`),
`inferBestiaryClassDamageBonus` (`M-036`) e `inferBmPierceFromCharmDamage` (`C-012a`); a chave
de testemunha e o valor previsto dos três ganham a postura. `js/unified-formulas.js`: constantes
declaradas do Combat Mastery (degraus candidatos e tetos). Nenhuma mudança em resolução de
turno, validação de bloco, leech ou reversão de dano de hit.

**Raio medido (varredura de 137 sessões, 41 pares — `reports/proto-charm-ladder-corpus.txt`).**
Sessões com escada: **4** (`picture` S0, `tom` S0, `tom 2` S0, e `crypt` S0 que **não** passa no
teste de grade). Sessões com omega ativo hoje: **2** (`crypt`, `picture`).

| fixture | hoje | depois | por quê |
|---|---|---|---|
| `picture` S0 | omega ATIVO (falso), classe `charm_evidence_inconclusive` | omega inativo, classe **sem bônus provado** | escada `1%`, span `1,0496 < 1,09`; tetos `0,9990`/`0,9999`/`1,0095` eliminam toda a grade |
| `crypt` S0 | omega ATIVO | **omega ATIVO** | `cyclursus` tem 2 níveis (`659/699 = 1,0607`), não é escada |
| `tom` / `tom 2` S0 | sem omega, classe inconclusiva | sem omega, classe abstém | escada `2%` real, mas a linha é de `overpower charm` e o teto (`1,411`) não discrimina |
| `ek boss` S0 | — | idêntico | **zero** linhas de charm no Server Log |
| `bastion`, `night harpy` | `no_anchored_charm_witness_row` | idêntico | `13/Jun/2026`, pré-cutoff, tabela sem `hitpoints` |
| outras 133 sessões | — | idêntico | nenhuma escada |

**Drift de classificação esperado: ZERO turnos.** Em `picture`, o selo de omega não rotula
nenhum hit da partição vencedora (`0` hits `omegaActive`) e nenhum turno usa a folga cross-state
de `S-004c` (`0` turnos) — medido no diagnóstico da Fase 2. A confirmação é o diff do dump
completo contra o `latest`.

**Fora de escopo.** Reverter o degrau de Combat Mastery no dano de cada hit (decisão do usuário,
07/Set/2026): exigiria 8 originais candidatos a `1%` de distância, que apagariam o gate de
exatidão same-mob de `S-004a` — o mesmo risco que `M-039` já declara para omega com apenas 2
candidatos. A suspeita aberta sobre `overpower charm` em `CHARM_ELEMENT_MAP` (`C-012a`)
permanece registrada e não trabalhada.
