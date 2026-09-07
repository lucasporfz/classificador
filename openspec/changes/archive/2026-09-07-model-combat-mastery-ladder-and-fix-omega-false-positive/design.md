## Context

O canal de **dano de charm ofensivo** é a testemunha determinística do motor: ele vale
`hitpoints × 0,05 × mitigação × effectiveMod(mod, pierce)`, é fixo por mob (sem sorteio) e não
depende de classificação. Três leituras dependem dele — `M-036` (bônus de dano contra classe de
bestiário), `C-012a` (pierce de Battle Momentum) e `M-039` (perk omega).

Esse canal está contaminado em `picture` por dois efeitos que o motor não modela na testemunha:

1. **Combat Mastery** — perk de roda, exclusivo de knight, `+1%` de dano por `14/12/10%` de vida
   faltante do alvo, dobrado com arma de duas mãos. Ele multiplica o dano de charm, e cada
   criatura exibe os degraus em que ela estava. Não existe no motor.
2. **Protector** — `M-041` já modela o `×0,85` no dano de hit e na base de leech, e já declara
   que postura `unknown` invalida a testemunha, mas o valor previsto da testemunha **não**
   desconta o `0,85` quando a postura é conhecida.

O sintoma visível é o selo `Omega ×1.06` em `picture`. `inferOmegaPerk` procura *"existe um
nível a ~1,06 do ancorado"* por **distância ao valor** (`anchor × 1,06 ± 1,25%`, ou seja razões
de `1,0466` a `1,0733`), ancora em `927` e aceita `973` — razão real `1,0496`, que é o 5º degrau
de uma escada de `1%`, não o perk.

Este design foi fechado com três protótipos joga-fora, todos contra o corpus real:
`tools/proto-charm-ladder.mjs` (varredura de 137 sessões, 41 pares),
`tools/proto-m036-with-stance.mjs` (veredito de `M-036` sob cada variante) e
`tools/proto-c012a-probe.mjs` (veredito de `C-012a`). As medições estão citadas nas decisões.

## Goals / Non-Goals

**Goals:**

- Acabar com o falso positivo de omega em `picture`, sem tocar no texto de `M-039` e sem mudar
  `crypt`, onde o perk foi calibrado.
- Declarar o Combat Mastery como mecânica de domínio, com detector por sessão.
- Corrigir o valor previsto da testemunha de charm para descontar o Protector, nas **três**
  leituras.
- Manter drift de classificação em **zero turnos**.

**Non-Goals:**

- **Reverter o degrau de Combat Mastery no dano de um hit.** Decisão do usuário em 07/Set/2026.
- Modelar o gatilho por vida do alvo (o motor não observa vida de criatura — mesma abstenção que
  `M-039` já declara para o gatilho do omega).
- Corrigir o mapeamento de `overpower charm` em `CHARM_ELEMENT_MAP`, suspeita aberta de `C-012a`.
- Mudar resolução de turno, validação de bloco, cardinalidade por leech ou reversão de hit.

## Decisions

### D1 — O discriminador é a FORMA da escada, não a tolerância da razão

**Escolhido:** uma linha-testemunha com `≥3` níveis (piso de `≥3` procs cada) que caem sobre a
grade `menorNível × (1 + s·n)`, `s ∈ {1%, 2%}`, `n` inteiro `≤ 9`, com span dentro do teto de
`s`, é escada de Combat Mastery.

**Alternativa rejeitada — apertar a tolerância de `M-039` para `1,06` estrito.** Não resolve: o
**6º degrau** da escada de `1%` é exatamente `×1,06`, e `picture` mede `1,0597` no maior degrau
de mob×postura. Um corte estrito continuaria acusando omega em qualquer knight cujo charm
exibisse aquele degrau.

**Alternativa rejeitada — contar níveis sem checar a grade.** Mede-se que ela **quebra `crypt`**:
a linha `crypt mage | freeze` tem 3 níveis (`665`, `705`, `1098`), e um teste por contagem a
declararia escada, abstendo a sessão inteira e desligando o omega onde ele é real. O `1098` está
a `1,6511` — fora de toda grade e de todo teto —, e é a checagem de grade que o exclui como
contaminação. A outra linha (`cyclursus | zap`, `659/699 = 1,0607`) tem 2 níveis e continua
confirmando omega, então `crypt` fica intacto.

**Alternativa rejeitada — gate por vocação (`knight` ⇒ nunca omega).** Combat Mastery é
knight-only, então seria simples e teria zero falso positivo. Cai por duas razões: (a) a vocação
é inferida **depois** do detector de omega em `buildContext`, e `stanceSetup.hasStanceCasts` não
serve de proxy — `tom` é knight e **não** lança postura nenhuma; (b) o usuário pediu explicitamente
para modelar os dois perks juntos, e um gate por vocação apaga o omega de todo knight para sempre.

### D2 — Os tetos são derivados das constantes do perk, não calibrados

`+1%` por `14/12/10%` de vida faltante ⇒ no máximo `floor(99/10) = 9` degraus. Logo:

| degrau observado | origem | teto |
|---|---|---|
| `1%` | escudo / arma de uma mão | `×1,09` |
| `2%` | arma de duas mãos (bônus dobrado) | `×1,18` |

O degrau `s` é observável na escada; o **nível** do perk (1/2/3) e a arma não são. Por isso o
teto usado é o **maior** compatível com o `s` observado — escolha conservadora do usuário em
07/Set/2026: nunca acusa omega falso, pode perder um omega real. Um teto de nível 1 (`×1,07`)
acusaria falsamente um knight com o perk em nível 2 ou 3 — exatamente o defeito que esta change
existe para consertar.

Corroboração medida: `tom`/`tom 2` (mesmo personagem `Kikaro`, EK) exibem degrau de `≈2%` e span
`1,1198`/`1,1196`, dentro do teto `1,18` — assinatura de knight com arma de duas mãos, num
fixture independente de `picture`.

### D2a — A tolerância de encaixe na grade é `±1` ponto de dano

Decisão do usuário em 07/Set/2026. Não é constante nova: reusa a folga de `1` ponto que
`S-004c` já declara e mediu para omega. Dano de charm é determinístico, e os resíduos reais são
de ordem muito menor que o degrau: `picture` encaixa com `0,27` / `0,81` / `0,35`, `tom` com
`0,1` a `0,8`, `tom 2` com `0,16` a `0,88`, e o `705` de `crypt` com `0,10`. O `1098` de `crypt`,
que precisa ser **rejeitado**, erra por mais de `350` — separação de duas ordens de grandeza.

A tolerância larga de `M-036` (`max(2, esperado × 1,25%)`) **não** serve aqui: num dano de
`≈1000` ela vale `12,5` pontos, mais do que o degrau de `1%` (`≈10`), e faria níveis vizinhos da
escada colidirem. Ela permanece intacta no caminho sem escada.

### D2b — Uma linha prova a escada mesmo sem ancorar na fórmula

Decisão do usuário em 07/Set/2026. A escada é lida das **razões entre níveis observados**, que
não dependem de o valor previsto fechar. Caso concreto: `tom`/`tom 2` só têm a linha de
`overpower charm`, cujo dano nunca bate com a fórmula (previsto `591,8`, observado `835–935`)
porque esse charm escala com a vida do **personagem** — fato já declarado pelo usuário e
registrado como suspeita aberta em `C-012a`. Mesmo assim ele **sofre** o ajuste do Combat
Mastery, e o espaçamento de `2%` entre os sete degraus identifica o perk.

Restringir a escada a linhas ancoradas foi considerado e rejeitado: hoje daria o mesmo resultado
em todo o corpus, mas deixaria cega uma sessão em que nenhuma linha ancora, e por onde um `+6%`
falso poderia passar. Ser mais abrangente aqui empurra para o lado seguro.

### D3 — Sob escada, multiplicador uniforme vira TETO contra o menor nível

**Medido, e é o achado que trava esta decisão:** corrigir só o Protector, mantendo o teste
atual (igualdade contra a **mediana** da linha), faz `picture` sair de abstenção correta para
**`mammal +3,0%` falso** — a mediana de cada linha cai num degrau da escada. Trocar a mediana
pelo **menor nível** e manter a igualdade dá outro falso, `reptile +2,0%`, porque a tolerância
larga de `M-036` (`max(2, esperado × 1,25%)`) é **maior** que o degrau de `1%` e dois candidatos
vizinhos "explicam" o mesmo nível ao mesmo tempo — exatamente o defeito que `C-006a`(2) já
documentou para encaixe.

**Escolhido:** o fato mecânico é que **Combat Mastery só soma, nunca subtrai**. Logo o menor
nível observado de uma linha é um **limite superior** do dano sem o perk, e um candidato `b` de
multiplicador uniforme da sessão é **eliminado** quando `esperado × (1 + b) > menorNível + 1`. O
veredito da classe é a **interseção** dos candidatos sobreviventes de todas as suas linhas:
vazio ⇒ **sem bônus, provado**; exatamente um ⇒ esse bônus; mais de um ⇒ abstém (`D-006`).

A tolerância de `1` ponto é a mesma do encaixe na grade (D2a) e não é constante nova: dano de
charm é determinístico e o modelo bate a `≤1` ponto nas linhas ancoradas de `picture`
(`728` vs `728,1`; `971` vs `971,1`; `928` vs `928,9`; `927` vs `926,9`).

Medido com a regra do teto:

| sessão | classe | tetos das linhas | veredito |
|---|---|---|---|
| `picture` S0 | `mammal` (7 linhas) | `0,9990` · `0,9999` · `1,0001` · … | **sem bônus, provado** |
| `picture` S0 | `reptile` (2 linhas) | `1,0095` · `1,0191` | **sem bônus, provado** |
| `picture` S0 | `giant` (2 linhas) | `0,9995` · `0,9999` | **sem bônus, provado** |
| `tom` / `tom 2` S0 | `human` (1 linha) | `1,411` | abstém (12 candidatos sobrevivem) |

Todos terminam em `bonus = 0`, igual a hoje — mas `picture` agora chega lá por **prova
positiva**, não por inconclusividade, e o falso positivo é impossível por construção.

**Por que isto, e não abstenção em bloco.** A abstenção de sessão foi a primeira proposta e o
usuário a **rejeitou** em 07/Set/2026: um EK pode ter Combat Mastery **e** reward de bestiário
ao mesmo tempo, e apagar o canal inteiro tornaria o segundo indetectável para sempre. Com o
teto, a classe que exibir o **degrau zero** ainda crava o bônus: um `mammal` real de `+2%` faria
`gorerilla` observar `742/743` em vez de `728`, o teto viraria `1,0218` e **só** o `+2%`
sobreviveria.

**Alternativa rejeitada — abster só as linhas que são escada.** Medida e insuficiente: em
`picture` a linha `gorerilla | freeze | Blood Rage` tem **um** nível só (`873`, razão `1,0192` =
2 degraus) e não seria marcada como escada, mas envenenaria o voto da classe do mesmo jeito. O
teto, ao contrário, funciona linha a linha sem precisar que a linha seja escada.

**Limitação declarada.** O teto identifica o bônus com unicidade quando a grade não deixa dois
candidatos abaixo dele — na prática, os bônus pequenos e as linhas que observam o degrau zero.
Um bônus grande (ex.: `+5%`) deixa `2%`, `3%`, `4%` e `5%` todos abaixo do teto e a classe
**abstém**. É a mesma recusa de decidir de `D-021a` e `C-006a`(2), e é honesta: sob escada, a
evidência não separa esses candidatos.

### D3a — Omega NÃO usa o teto inferior, e a razão é mecânica

O teto de D3 vale para multiplicador **uniforme da sessão** (bônus de classe, pierce): ele
empurra a escada inteira para cima, então o piso da escada o limita. Omega é **por-hit e
binário**: hits sem omega continuam existindo, o menor nível continua sendo o nível sem omega, e
o teto inferior eliminaria a hipótese de omega em **toda** sessão com escada — o oposto do que o
usuário pediu.

Omega **estende** a escada para cima, então o instrumento certo é o **teto superior** (D2/D6):
um nível acima do que a escada sozinha alcança, sobre a grade estendida `(1 + s·n) × 1,06`.

Coerência das duas: multiplicador uniforme é limitado pelo **piso** da escada; multiplicador
por-hit é revelado pelo **teto** dela.

### D3b — O canal de BM é inerte nos knights do corpus

Medido: `picture` e `tom` terminam com `bmPierce = 0` por `source = not_paladin` — o motor
curto-circuita BM fora de paladino. Sob o teto, `C-012a` passaria de `null` (sem veredito) para
`0` nas duas, com o **mesmo** resultado final; o que muda é o caminho (a sessão deixa de
precisar da classificação-sonda de `C-012`), não o número. Ainda assim o efeito é verificado
pelo diff do dump, não assumido.

### D4 — A escada é declarada, não revertida

Reverter exigiria escolher, por hit, entre **8** originais candidatos separados por `1%`. `M-039`
já declara o risco com apenas **2** candidatos ("no eixo físico os dois intervalos candidatos do
mesmo hit se sobrepõem e admiti-los livremente faria a interseção quase sempre fechar, esvaziando
`physical_intersection_empty` como discriminador"). Com 8 candidatos a `1%`, o gate de exatidão
same-mob de `S-004a` — que decide fronteira de componente — deixaria de discriminar.

Evidência adicional de que não vale o risco: em `picture`, **72 de 73** pares same-espécie a 1–2
degraus já caem no mesmo componente hoje, e a dispersão same-espécie **não** é maior nos turnos
sem AA (`16,7%` acima de `1,04` contra `30,6%` nos turnos com AA). O efeito da escada neste log é
**viés de dano base**, não corte errado.

Precedentes da mesma disciplina: `M-037` (decay de Chained Penance, declarado e não reconstruído)
e o `+25%` de Blood Rage em `M-041`.

### D5 — Onde o detector roda

`inferCombatMasteryLadder(serverFacts, context)` depende **apenas** de: eventos de charm, janelas
de `utevo grav san` e linha do tempo de postura. Não precisa de tabela de mobs, de `pierce` nem
de classificação — a escada é lida dos **níveis observados**, e a grade é ancorada no menor nível
da própria linha.

Isso permite posicioná-lo logo depois de `stanceSetup`/`gravSanSetup` em `buildContext`, antes de
`inferBestiaryClassDamageBonus` e `inferOmegaPerk`, e replicá-lo no `charmProbeContext` que
`classifyUnified` monta para `C-012a` — que roda antes de `classifyUnifiedParsed`.

### D6 — A via do teto fica declarada e sem caso no corpus

O caminho "nível acima do teto sobre a grade estendida `(1 + s·n) × 1,06` prova omega" não é
exercitado por nenhuma sessão de `logs/` — nenhum knight do corpus tem os dois perks. Ele é
coberto por **teste sintético**, e é declarado como tal, no mesmo estilo do Override 2 de `M-031`
("defensivo/estrutural, não uma correção comprovada") e do risco de Stage 1/2 de `M-016e`.

## Risks / Trade-offs

- **[Sob escada, um bônus de classe grande fica indeterminado]** → O teto elimina só o que está
  acima dele; um bônus real de `+5%` deixa `2%`–`5%` todos abaixo e a classe abstém. Limitação
  declarada, mesma recusa de decidir de `D-021a` e `C-006a`(2). Bônus pequeno, ou classe que
  exiba o degrau zero, continua cravável — que é o que o usuário exigiu em 07/Set/2026.

- **[Um knight com omega e Combat Mastery cujo teto não apareça no log fica sem o selo]** →
  Declarado. O teto conservador (`×1,09`/`×1,18`) nunca acusa falso, mas exige que a criatura
  tenha sido observada num degrau alto. Nenhum fixture exercita isso.

- **[O dano base de knight com o perk fica enviesado em `+0` a `+6%`]** → Declarado em `M-042`,
  precedente `M-037`. Não afeta classificação: `72/73` pares same-espécie a 1–2 degraus já ficam
  no mesmo componente.

- **[A grade de `1%` é densa: com tolerância frouxa, quase todo nível "encaixa"]** → Ver D2a: a
  tolerância é `±1` ponto, reusada de `S-004c`, e a separação medida é de duas ordens de
  grandeza. A tolerância larga de `M-036` permanece intacta no caminho sem escada.

- **[A tolerância apertada é usada em dois lugares novos]** → Encaixe na grade (D2a) e teste de
  teto (D3). Os dois só rodam em sessão com escada detectada; fora dela nenhuma tolerância muda,
  e o drift é zero por construção.

- **[`crypt` é o fixture de risco e é grande]** → O raio foi medido **antes** de qualquer edição:
  a varredura de 137 sessões mostra que só `picture`, `tom`, `tom 2` e `crypt` têm `≥3` níveis, e
  `crypt` é excluído pela grade. A validação da Fase 4 escopa `picture` + `crypt` + `tom`/`tom 2`
  antes do corpus inteiro.

- **[Adicionar a postura à chave reduz `n` por linha e pode derrubar linhas abaixo do piso de 3
  procs]** → Medido em `picture`: as linhas vão de `5` para `11`, e `5` delas ancoram **exatamente**
  (`728` vs `728,1`; `971` vs `971,1`; `928` vs `928,9`; `927` vs `926,9`; `1055` vs `1045,1`) —
  contra `2` ancoradas hoje. O agrupamento fica mais fino e mais correto. Fora de `picture` o
  efeito é nulo: `ek boss` tem zero linhas de charm, `bastion` e `night harpy` são pré-cutoff
  (tabela sem `hitpoints`, `anchoredRows = 0`) e nenhum outro fixture tem cast exato de postura.

## Migration Plan

Não há migração: o detector é **inerte** onde não há escada (mesmo padrão de `M-035`, `M-036`,
`M-039`, `M-040`, `M-041`), e a única sessão do corpus cujo setup muda é `picture` S0. Reversão =
reverter o diff; não há estado persistido.

## Open Questions

Nenhuma pendente. As três decisões abertas na Fase 3 foram fechadas pelo usuário em 07/Set/2026:
declarar sem reverter (D4), modelar os dois perks juntos pelo teto (D2/D6), e aplicar o desconto
do Protector às três leituras (spec `unified-knight-stance`).
