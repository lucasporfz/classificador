# unified-bm-pierce-detection Specification

## Purpose
TBD - created by archiving change bm-pierce-detection-decoupled. Update Purpose after archive.
## Requirements
### Requirement: A detecção do BM não depende da classificação em BM=0

O motor Unified SHALL inferir o perk BM (+4% pierce holy/físico) comparando as
hipóteses de pierce pela coerência cross-mob que **cada hipótese resolve**, em DOIS
canais de evidência — holy (blocos `spell`/`grenade` holy, paladin, ≥2 mobs
distintos) e físico (blocos `arrow` RP "limpos", ≥2 mobs distintos) — e MUST NOT
restringir a amostragem de nenhum dos dois canais aos blocos resolvidos com
`pierce=0`. Blocos discriminantes (holy ou físicos) que ficam `unresolved` sob
`pierce=0` (por incoerência de reversão cross-mob) MUST continuar a contribuir para a
decisão — via a resolução que obtêm sob `pierce=0.04`.

#### Scenario: Bloco holy discriminante que colapsa em BM=0 ainda pesa na decisão

- **WHEN** um cast holy AoE atinge, no mesmo impacto, um mob de `holyDmgMod` ≠ 1.0
  (ex.: darklight striker 0.9) junto de mobs `holyDmgMod` 1.0, e sob `pierce=0` a
  reversão cross-mob é incoerente a ponto de o turno virar `unresolved`
- **THEN** a detecção do BM SHALL considerar esse cast ao comparar `pierce=0` e
  `pierce=0.04` (pela resolução/coerência que cada pierce produz) e MUST NOT ignorá-lo
  só porque ele não resolveu sob `pierce=0`

#### Scenario: Bloco físico discriminante que só converge em BM=0.04 pesa na decisão

- **WHEN** um bloco `arrow` RP "limpo" (≥2 mobs, sem overkill/crit/onslaught/lowBlow
  /prey/EW) tem interseção física vazia sob `pierce=0` mas converge para um intervalo
  não-vazio sob `pierce=0.04`
- **THEN** a detecção do BM SHALL considerar esse bloco ao comparar as duas hipóteses,
  do mesmo modo que já faz para blocos holy equivalentes

#### Scenario: vemiath ganha BM

- **WHEN** o motor classifica a sessão `vemiath` (`darklight e vemiath`, pré-cutoff),
  onde `pierce=0.04` resolve muito mais blocos holy cross-mob coerentes que `pierce=0`
- **THEN** a detecção SHALL inferir `bmPierce = 0.04` (hoje devolve 0)

### Requirement: O canal físico de prova usa apenas o subconjunto de hits sem graus de liberdade extras

O motor Unified SHALL definir um bloco de prova físico (`physicalRpPierceProbeSubset`
ou equivalente) filtrando, dentro de cada componente `arrow` resolvido de contexto RP,
o SUBCONJUNTO de hits que não sejam overkill, crítico real, Onslaught, Low Blow, dano
de active prey, nem tenham Expose Weakness — e usando esse subconjunto como bloco de
prova quando tiver pelo menos 2 hits de pelo menos 2 mobs distintos. O motor MUST NOT
exigir que TODO hit do componente `arrow` original seja limpo para o componente
entrar na amostra — turnos RP reais frequentemente misturam hits limpos e sujos
(crit/prey/etc.) no mesmo componente, e essa exigência mais estrita elimina o sinal de
sessões reais (caso-prova: sem ela, a sessão `mazzerinbarrage` salva
`17/Jun/2026 03:48:57` cai de 133 para 12 blocos-sonda, sem nenhuma discriminância
entre as duas hipóteses de pierce). A restrição ao subconjunto limpo garante `post=1`
e `crit=1` nos hits que efetivamente entram na amostra, eliminando graus de liberdade
que tornariam a reversão física ambígua para fins de detecção de BM.

#### Scenario: Hits com Expose Weakness são excluídos do subconjunto, mas o resto do componente pode entrar

- **WHEN** um componente `arrow` resolvido tem 2+ mobs distintos e um hit com
  `exposeWeakness=true` misturado com hits sem essa flag
- **THEN** o hit com Expose Weakness MUST NOT entrar no subconjunto de prova, mas os
  demais hits do mesmo componente SHALL ser considerados para formar o bloco de prova
  se ainda restarem >= 2 hits de >= 2 mobs distintos

#### Scenario: Hits críticos/Onslaught de um corte do Eixo 2-físico não contaminam a amostra

- **WHEN** um turno é classificado com um corte AA × Ethereal Barrage (Eixo 2-físico,
  `docs/CLASSIFICATION_RULES.md`), cujos blocos AA e Barrage resultantes contêm hits
  críticos/Onslaught (o sinal típico dessa fronteira)
- **THEN** esses hits críticos/Onslaught MUST NOT entrar no subconjunto de prova de BM,
  independentemente de qual lado do corte físico eles pertencem

### Requirement: A decisão de BM combina os canais holy e físico sem inventar uma métrica única de largura

O motor Unified SHALL combinar os dois canais de evidência somando a contagem de
blocos resolvidos (`okBlocks`) e de blocos que falharam (`failedBlocks`) de holy e
físico num total único, e SHALL aplicar os critérios de margem existentes
(`improvesOk`, `improvesFailures`) sobre esse total combinado. A largura média dos
intervalos (`avgWidth`) MUST NOT ser somada entre os dois canais — os dois canais têm
ruído de base em escalas diferentes (o intervalo físico é estruturalmente mais largo
por causa do roll de armadura). O critério de estreitamento (`improvesTightness`)
SHALL ser avaliado independentemente em cada canal, e a combinação SHALL considerá-lo
satisfeito se qualquer um dos dois canais, isoladamente, o satisfizer.

#### Scenario: mazzerinbarrage 03:48:57 ganha BM pela evidência combinada

- **WHEN** o motor classifica a sessão `mazzerinbarrage` salva `17/Jun/2026 03:48:57`,
  onde o canal holy sozinho não cruza nenhuma das 3 margens (quase-empate: 38→39
  blocos OK, 1→0 falhas, avgWidth 1.50→1.36) mas o canal físico cruza
  `improvesOk` e `improvesFailures` com folga larga (126→133 blocos OK, 7→0 falhas)
- **THEN** a detecção SHALL inferir `bmPierce = 0.04` (hoje devolve 0 para essa sessão)

#### Scenario: Sessões sem BM não ganham o perk por acúmulo de ruído físico

- **WHEN** o motor classifica uma sessão sem BM (`barrage`, `mk`, `bakra`, `uhax2`),
  onde nem o canal holy nem o canal físico, combinados, cruzam `improvesOk` ou
  `improvesFailures` com a margem exigida
- **THEN** a detecção SHALL continuar a inferir `bmPierce = 0` e MUST NOT ativar o
  perk só porque o volume maior de blocos físicos testados aumenta a chance de ruído
  cruzar a margem por acaso

#### Scenario: highwin2 mantém o BM com o canal físico neutro

- **WHEN** o motor classifica `highwin2`, onde o canal físico não discrimina
  (mesma contagem de blocos OK sob as duas hipóteses, sem falhas em nenhuma) mas o
  canal holy já cruzava a margem sozinho antes desta mudança
- **THEN** a detecção SHALL continuar a inferir `bmPierce = 0.04`, sem que a ausência
  de sinal físico bloqueie ou enfraqueça a decisão que o canal holy já sustenta

### Requirement: A detecção do BM preserva os casos já corretos

A mudança na detecção MUST NOT alterar o pierce inferido nas sessões onde ele já é
correto: sessões com BM detectado continuam com `pierce=0.04`; sessões sem BM
continuam com `pierce=0` (sem falso-positivo).

#### Scenario: highwin2 mantém o BM

- **WHEN** o motor classifica `highwin2`, onde o BM já é corretamente detectado
- **THEN** a detecção SHALL continuar a inferir `bmPierce = 0.04`

#### Scenario: sessões sem BM não ganham o perk

- **WHEN** o motor classifica uma sessão sem BM (ex.: `barrage`, `mk`, `bakra`), onde
  `pierce=0.04` não melhora — ou piora — a coerência holy cross-mob
- **THEN** a detecção SHALL inferir `bmPierce = 0` e MUST NOT ativar o perk

### Requirement: O BM correto restaura a homogeneidade determinística

Com o pierce correto inferido, a reversão holy cross-mob de um mesmo cast SHALL
convergir para um original comum dentro da tolerância do cluster, de modo que o
componente holy determinístico (H-001) valide sem afrouxar a tolerância. A detecção
do BM MUST NOT ser substituída por um relaxamento da tolerância `ELEMENTAL_CLUSTER_*`.

#### Scenario: Caldera de 22:41:50 fica homogênea com BM

- **WHEN** o motor classifica `darklight e vemiath 22:41:50` com `bmPierce=0.04`
  inferido, cujo bloco de Divine Caldera atinge striker (0.9) e mobs 1.0
- **THEN** a reversão holy SHALL convergir cross-mob (striker e mobs 1.0 no mesmo
  original, dentro da tolerância) e o turno SHALL resolver como AA + Divine Caldera +
  Divine Grenade, sem cair em `unresolved`/N-010

### Requirement: O dano de charm é testemunha direta do pierce de BM, sem classificar

O motor Unified SHALL poder inferir `bmPierce` a partir do **dano de charm ofensivo**,
usando apenas fatos de parsing (`serverFacts.events`), **antes** de qualquer resolução de
turno. O dano de charm é fixo por mob (sem sorteio) e vale
`hitpoints × 0,05 × mitigação × effectiveMod(modElemento, pierce)` — a mesma fórmula de
M-036 — e o BM altera `effectiveMod` **somente** para os elementos `holy` e `physical`
(`pierceForElement`). Logo, as testemunhas diretas do perk são exatamente duas:
**`wound charm`** (canal físico) e **`divine wrath charm`** (canal holy).

Nenhum outro charm SHALL ser usado como testemunha do BM. Em particular, `overpower
charm` MUST NOT ser tratado como testemunha física, ainda que `CHARM_ELEMENT_MAP` o
mapeie hoje como `physical`.

Uma linha de testemunha é `(mob, elemento, estado de Expose Weakness)` com pelo menos 3
procs, fora de qualquer janela de `utevo grav san` (mesmas exclusões de M-036), num mob
presente na tabela de mods do regime da sessão e com `hitpoints` conhecido. Linhas de
elementos que o BM não afeta MUST NOT ser usadas para decidir o perk.

#### Scenario: duas testemunhas independentes decidem o perk sem classificação

- **WHEN** uma sessão tem linhas de `wound charm` e `divine wrath charm` repetidas fora
  de janela de grav san — ex.: `mazzerinbarrage` salva `28/Jun/2026`, com
  `darklight matter` / wound + EW (n=18, observado `1656`),
  `darklight source` / divine wrath + EW (n=8, observado `1587`) e
  `darklight source` / divine wrath (n=3, observado `1527`) —, cujos valores previstos
  sob `pierce=0,04` são `1656,7`/`1585,9`/`1526,1` e sob `pierce=0` são
  `1628,1`/`1556,0`/`1496,1`
- **THEN** o motor SHALL inferir `bmPierce = 0,04` a partir dessas testemunhas, **sem
  executar nenhuma classificação de turno**, e o valor MUST coincidir com o que o método
  cross-mob infere para a mesma sessão

#### Scenario: sessão pré-cutoff não tem testemunha e usa o método atual

- **WHEN** a sessão é pré-cutoff (D-016), cujo regime de mods não fornece `hitpoints`
- **THEN** nenhuma linha de testemunha de charm é formada e o motor SHALL usar o método
  de coerência cross-mob (holy + físico) já especificado, sem alteração de resultado

### Requirement: A testemunha de charm exige unanimidade, senão cai no método cross-mob

O veredito por charm SHALL ser aceito somente quando **todas** as linhas discriminantes
(holy/físico) da sessão concordarem com a mesma hipótese de pierce. Havendo qualquer
conflito entre linhas, ou não havendo nenhuma linha discriminante, o motor MUST usar o
método de coerência cross-mob existente. O motor MUST NOT decidir o perk por maioria de
linhas.

#### Scenario: linhas em conflito não decidem

- **WHEN** uma sessão tem uma linha de charm que fecha sob `pierce=0` e outra que fecha
  sob `pierce=0,04`
- **THEN** o motor MUST NOT escolher entre elas e SHALL delegar a decisão ao método
  cross-mob, exatamente como se não houvesse testemunha de charm

### Requirement: A testemunha de charm desconta o bônus de classe de bestiário pelos elementos imunes ao BM

O motor Unified SHALL descontar o bônus de classe de bestiário (M-036) antes de usar uma linha de charm como testemunha do BM. Existe circularidade — o dano de charm é multiplicado pelo bônus de classe, e a detecção desse bônus por sua vez depende de `bmPierce` — e o motor SHALL quebrá-la pela assimetria dos dois efeitos: o BM afeta apenas `holy`/`physical`, enquanto o bônus de classe afeta todos os elementos daquela classe. Os charms de elementos imunes ao BM (`fire`, `ice`, `death`, `earth`, `energy`) SHALL ser usados para medir o bônus de classe, e só então as linhas `holy`/`physical` da mesma classe, corrigidas por ele, SHALL testemunhar o BM.

Uma linha `holy`/`physical` cuja classe de bestiário não tem nenhuma testemunha imune MUST ser tratada como não-discriminante tanto para a inferência do bônus de classe quanto para a inferência de BM. O motor MUST NOT assumir bônus de classe igual a 1 nem atribuir o excesso observado ao perk de classe para tornar a linha utilizável.

Sob escada de Combat Mastery, essas linhas MAY continuar participando dos tetos conservadores e do diagnóstico de ausência definido em M-042, mas MUST NOT, sozinhas, confirmar um bônus positivo de classe. Um veredito positivo continua exigindo ao menos uma testemunha imune ao BM para a mesma classe.

#### Scenario: classe sem testemunha imune não decide nenhum dos perks

- **WHEN** a única evidência de charm de uma classe de bestiário é holy ou física, sem nenhum charm de elemento imune ao BM na mesma classe
- **THEN** essa linha MUST NOT confirmar bônus de classe nem `bmPierce`
- **AND** os dois eixos SHALL permanecer desconhecidos ou ser decididos por evidência independente

#### Scenario: repetição da mesma linha não remove o confundimento

- **GIVEN** `drone ingol` possui 42 procs na linha `liodile | holy`
- **AND** não possui testemunha imune que meça a classe `humanoid`
- **WHEN** o bônus de classe é inferido
- **THEN** a repetição SHALL confirmar apenas o valor observado
- **AND** o motor MUST NOT inferir `humanoid +2%`

#### Scenario: escada não transforma linha sensível em prova positiva

- **GIVEN** uma classe possui apenas linhas `holy`/`physical`
- **AND** Combat Mastery produz uma escada ativa
- **WHEN** o teto de M-042 deixa um único candidato positivo
- **THEN** esse candidato MUST NOT ser confirmado como perk de classe sem uma testemunha imune ao BM

### Requirement: Havendo veredito por charm, a sessão é classificada uma única vez

Quando a testemunha de charm decidir o pierce, `classifyUnified` SHALL classificar a
sessão **uma única vez** já com esse `bmPierce`, e MUST NOT executar a classificação-sonda
sob a hipótese alternativa. Quando não houver veredito, o fluxo atual (classificação base,
sonda quando há turnos `unresolved`, e decisão cross-mob) permanece inalterado.

#### Scenario: sessão com turnos unresolved e testemunha de charm não paga a sonda

- **WHEN** a classificação base de uma sessão produziria turnos `unresolved` (condição que
  hoje dispara a segunda classificação completa) mas existe veredito de charm para a
  sessão
- **THEN** o motor SHALL usar o pierce do veredito na única classificação e MUST NOT
  executar a segunda classificação completa

### Requirement: O atalho por charm não altera nenhum pierce hoje correto

O `bmPierce` inferido com o caminho por charm ativo MUST ser idêntico, em todas as
sessões do corpus, ao inferido pelo método atual — incluindo as sessões que hoje
resultam em `bmPierce = 0`. Qualquer divergência é regressão e MUST bloquear a ativação
do atalho; ela MUST NOT ser acomodada afrouxando a tolerância do teste de charm.

#### Scenario: corpus inteiro mantém o mesmo pierce

- **WHEN** o motor classifica todos os fixtures — os pares de `tools/dump-unified.mjs` e
  também os que ficam fora dele (`kim`, `mk`, `monk 2`, `uhax 3`, `serverlog6-9`,
  `bakradrone`, `highwin 2`, `death echo`)
- **THEN** o `bmPierce` por sessão MUST ser igual ao de antes da mudança, e o dump por
  turno MUST permanecer bit-idêntico

#### Scenario: o detector sabe dizer que NÃO há BM

- **WHEN** existe uma sessão com testemunha de charm holy/física suficiente e sem o perk
  BM
- **THEN** o veredito por charm MUST ser `bmPierce = 0` (e não "sem sinal" nem `0,04`) —
  sem essa prova de controle negativo, o caminho por charm MUST NOT ser usado como
  decisão primária

