# unified-combat-mastery-ladder Specification

## Purpose

Define como o motor Unified reconhece a **escada de dano do Combat Mastery** — perk de roda de
habilidade, exclusivo de knight, que soma `+1%` de dano a cada `14/12/10%` de vida faltante do
alvo, dobrado com arma de duas mãos — no canal de testemunha de dano de charm, e o que essa
escada faz com as três leituras que consomem esse canal (`M-036` bônus de classe de bestiário,
`M-039` perk omega, `C-012a` pierce de Battle Momentum). A escada é **declarada e não
revertida**: o motor não observa a vida da criatura, então não escolhe o degrau de um hit.
Regra normativa: `M-042` em `docs/CLASSIFICATION_RULES.md`.

## Requirements

### Requirement: A escada de Combat Mastery é detectada por sessão no canal de charm

O motor SHALL avaliar, por sessão, cada linha-testemunha de dano de charm — agrupada por
`(mob, charm, elemento, Expose Weakness, elemental amplification, postura do knight)`, fora de
janela de `utevo grav san` e com postura conhecida — em busca de uma escada de Combat Mastery.

Uma linha é escada quando **todas** as condições valem:

1. ela exibe **3 ou mais níveis distintos** de dano, cada um com no mínimo `3` procs (o mesmo
   piso de `M-036`/`C-012a`/`M-039`);
2. existe um degrau `s` entre os candidatos declarados `{0,01; 0,02}` para o qual **ao menos 3**
   níveis caem sobre a grade `menorNível × (1 + s·n)`, com `n` inteiro em `[0, 9]` e dentro do
   teto de `s`, com folga de `1` ponto de dano.

Nível que não cai na grade **não conta** e **não desqualifica** a linha (ver o requisito de
contaminação abaixo) — a condição é sobre os níveis **na grade**, nunca sobre o span bruto da
linha. Entre os dois degraus SHALL vencer o que explica **mais** níveis; empate fica com o menor.
Quando linhas diferentes da mesma sessão elegem degraus diferentes, a sessão SHALL adotar o
**maior**: o degrau é fato do personagem, logo único, e o maior produz o maior teto — a escolha
conservadora.

O piso de 3 níveis SHALL ser entendido como consequência da mecânica, não como calibração: omega
é binário e produz exatamente **dois** níveis, então `3` é o mínimo que separa um perk graduado
de um binário.

Os tetos SHALL ser **derivados** das constantes declaradas do perk (`+1%` por `14/12/10%` de
vida faltante ⇒ no máximo `9` degraus; `×2` com arma de duas mãos), nunca escolhidos por
calibração. O degrau `s` é observável na própria escada; o nível do perk e a arma não são, então
o teto usado é o **maior** compatível com o `s` observado.

A folga de `1` ponto SHALL ser entendida como constante **nova**, derivada de medição (dano de
charm é determinístico; os resíduos de encaixe do corpus vão de `0,10` a `0,88`, enquanto o nível
que precisa ser rejeitado erra por mais de `350`) — e **não** como reuso da folga de `S-004c`,
que mede outra quantidade.

O detector NÃO SHALL ser condicionado à vocação, ainda que o perk seja exclusivo de knight: a
vocação é inferida depois dele e `stanceSetup` não serve de proxy (`tom` é knight sem cast de
postura). A contenção é a **forma** — duas populações não são escada, então uma testemunha de
omega nunca vira escada.

A detecção NÃO SHALL usar hits principais, partição, rótulo de componente ou qualquer resultado
de classificação: o dano de charm é fixo por mob e a escada é lida só dos níveis observados.

A linha NÃO SHALL precisar ancorar na fórmula de `M-036` para provar a escada: a evidência é a
**razão entre níveis observados**, que não depende de o valor previsto fechar. Um charm cujo dano
escala com a vida do próprio personagem (`overpower charm`) nunca fecha a fórmula e ainda assim
sofre o ajuste do perk, logo o espaçamento dos seus níveis identifica a escada.

#### Scenario: Linha com escada de degrau de 1%
- **WHEN** a linha `sabretooth | wound charm | physical | Blood Rage` de `picture` S0 exibe os
  níveis `927`, `936`, `954` e `973`, cada um com `≥3` procs
- **THEN** a linha é reconhecida como escada de Combat Mastery com degrau `s = 0,01`
- **AND** os níveis são `n = 0, 1, 3, 5` sobre a grade a partir de `927`
- **AND** o span `1,0496` cabe no teto `1,09`

#### Scenario: Linha com escada de degrau de 2%
- **WHEN** a linha `raubritter skirmisher | overpower charm` de `tom` S0 exibe oito níveis de
  `835` a `935`
- **THEN** a linha é reconhecida como escada com degrau `s = 0,02` e span `1,1198`, dentro do
  teto `1,18`

#### Scenario: Dois níveis não formam escada
- **WHEN** a linha `cyclursus | zap charm | energy` de `crypt` S0 exibe exatamente dois níveis
  (`659` e `699`)
- **THEN** a linha NÃO é escada
- **AND** ela continua sendo testemunha válida das três leituras que consomem o canal

#### Scenario: Nível fora da grade não é degrau
- **WHEN** a linha `crypt mage | freeze charm | ice` de `crypt` S0 exibe os níveis `665`, `705`
  e `1098`
- **THEN** a linha NÃO é escada, porque `1098 / 665 = 1,6511` não cai sobre a grade de nenhum
  dos degraus candidatos nem cabe em nenhum dos tetos
- **AND** o veredito de omega da sessão permanece o de `M-039`

### Requirement: Sob escada, multiplicador uniforme da sessão é testado como teto

O motor SHALL, em sessão com escada de Combat Mastery detectada, avaliar todo candidato de
multiplicador **uniforme da sessão** que consome a testemunha de charm — bônus de dano contra
classe de bestiário (`M-036`) e pierce de Battle Momentum (`C-012a`) — como **limite superior
contra o menor nível observado** da linha, e não como igualdade contra a mediana dela.

O fato mecânico que autoriza isso é que o Combat Mastery **só soma, nunca subtrai**: o menor
nível observado é um limite superior do dano sem o perk. Um candidato `b` SHALL ser eliminado
quando `previsto × (1 + b) > menorNível + 1`. A tolerância de `1` ponto é a mesma do encaixe na
grade, e a tolerância larga de `M-036` NÃO SHALL ser usada aqui — num dano de `≈1000` ela vale
`12,5` pontos, mais que o degrau de `1%`, e faria candidatos vizinhos sobreviverem juntos.

O veredito de uma classe SHALL ser a **interseção** dos candidatos sobreviventes de todas as
linhas dela: conjunto vazio ⇒ a classe fica **sem bônus, por prova** (a linha mais apertada
exclui toda a grade); exatamente um candidato ⇒ esse bônus; mais de um ⇒ a classe é
não-discriminante e **abstém** (`D-006`), com o motivo registrado no diagnóstico (`U-006`).

Este caminho SHALL valer somente sob escada. Sem escada, as leituras rodam com o teste atual e o
resultado é idêntico ao anterior a esta capacidade.

#### Scenario: Classe sem bônus é provada, não apenas inconclusiva
- **WHEN** `picture` S0 é classificada e as linhas de `mammal` têm tetos `0,9990`, `0,9999` e
  `1,0001`
- **THEN** nenhum candidato da grade sobrevive, porque o menor deles é `+2%`
- **AND** a classe `mammal` fica sem bônus **por prova**
- **AND** o `mammal +3,0%` que a mediana produziria NÃO é inferido

#### Scenario: Linha de um nível só participa do teto
- **WHEN** a mesma sessão tem a linha `gorerilla | freeze charm | ice | Protector` com um único
  nível (`728`, `3` procs) e previsto `728,1`
- **THEN** essa linha impõe teto `0,9999` à classe `mammal`
- **AND** ela não precisa ser escada para impor o teto

#### Scenario: Bônus de classe real continua detectável sob escada
- **WHEN** uma classe tem bônus real de `+2%` e alguma linha dela observa o degrau zero, de modo
  que o menor nível é `previsto × 1,02`
- **THEN** apenas o candidato `+2%` sobrevive ao teto
- **AND** a classe recebe `+2%`

#### Scenario: Teto largo demais faz a classe abster
- **WHEN** a linha `raubritter skirmisher | overpower charm` de `tom` S0 impõe teto `1,411`
- **THEN** doze candidatos da grade sobrevivem
- **AND** a classe `human` abstém, com o motivo registrado

#### Scenario: Sessão sem escada não muda
- **WHEN** nenhuma linha-testemunha da sessão é escada
- **THEN** as leituras rodam exatamente como antes desta capacidade
- **AND** o resultado da sessão é idêntico

### Requirement: Sob escada, o perk omega só é provável acima do teto superior

Em sessão com escada detectada, um nível a `×1,06` do nível ancorado NÃO SHALL confirmar o perk
omega: o sexto degrau da escada de `1%` é exatamente `×1,06` e os dois sinais são
indistinguíveis nessa faixa.

O omega NÃO SHALL ser avaliado pelo teste de teto contra o menor nível: ele é **por-hit e
binário**, não multiplicador uniforme da sessão, então hits sem omega continuam presentes, o
menor nível continua sendo o nível sem omega, e aquele teste eliminaria a hipótese de omega em
toda sessão com escada. Multiplicador uniforme é limitado pelo **piso** da escada; multiplicador
por-hit é revelado pelo **teto** dela.

O motor SHALL confirmar omega nessa situação somente quando existir um nível cuja razão ao nível
ancorado esteja **acima do teto** de Combat Mastery para o degrau observado e sobre a grade
estendida `(1 + s·n) × 1,06`, com `n` inteiro em `[0, 9]` — faixa que a escada sozinha não
alcança em nenhum nível do perk nem com arma de duas mãos.

Nível que não cai em nenhuma das duas grades é contaminação e SHALL ser ignorado (`D-006`),
nunca lido como prova de omega.

#### Scenario: Escada dentro do teto não prova omega
- **WHEN** o maior nível de toda linha-testemunha de `picture` S0 está a `1,0597` do ancorado,
  abaixo do teto `1,09`
- **THEN** o perk omega fica **inativo** na sessão
- **AND** nenhum hit ganha candidato adicional de original
- **AND** nenhum turno usa a folga cross-state de `S-004c`

#### Scenario: Nível acima do teto prova omega sobre a escada
- **WHEN** uma sessão exibe escada de degrau `1%` e uma linha-testemunha tem um nível a `×1,1236`
  do ancorado, que é `(1 + 0,01×6) × 1,06` sobre a grade estendida
- **THEN** o perk omega é confirmado nessa sessão
- **AND** o Combat Mastery permanece declarado e não revertido

#### Scenario: Nível fora das duas grades é ignorado
- **WHEN** uma linha-testemunha tem um nível a `×1,65` do ancorado
- **THEN** esse nível não confirma omega
- **AND** não impede que outra linha da mesma sessão confirme

### Requirement: Combat Mastery é declarado e não revertido

O motor SHALL registrar a escada detectada no diagnóstico da sessão, mas NÃO SHALL inferir,
reconstruir nem compensar o degrau de Combat Mastery no dano de nenhum hit — nem de arma, nem de
charm. A testemunha de charm informa quais degraus a criatura exibiu, não qual degrau estava
ativo num hit específico, e escolher entre os oito originais candidatos separados por `1%`
apagaria o gate de exatidão same-mob de `S-004a`, que decide fronteira de componente.

Consequência declarada: o dano base agregado (`A-006`) de uma sessão com o perk carrega `+0` a
`+6%` sem correção (média medida `≈ +3%` em `picture`). Mesma disciplina de `M-037` (decay de
Chained Penance) e do `+25%` de Blood Rage em `M-041`.

#### Scenario: Reversão de original em sessão com escada
- **WHEN** um hit ofensivo do dono ocorre em sessão com escada de Combat Mastery detectada
- **THEN** nenhum multiplicador de Combat Mastery entra na reversão do original
- **AND** nenhum divisor de Combat Mastery entra na base de leech

#### Scenario: Fronteira de componente não muda por causa da escada
- **WHEN** dois hits do mesmo mob e mesmo estado numa sessão com escada divergem por um degrau
- **THEN** o gate de exatidão same-mob (`S-004a`) age exatamente como antes desta capacidade
