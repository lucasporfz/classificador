# unified-executioner-throw-tiers Specification

## Purpose

Define como o motor Unified decide, por-hit, se um hit de **Executioner's Throw**
(`exori amp kor`, knight/EK, elemento `physical`, área) levou o bônus condicional
por vida do alvo (execute: `+100%`/`+125%`/`+150%`, uma mastery fixa por
personagem), e como a tabela de rotação expõe as sub-linhas `base`/`amped`.

Diferente de Terra Burst/Ice Burst — cujo tier sai da reversão elemental — aqui a
decisão é **leech-primária por-canal, por-turno**: um EK pode empunhar arma com 0%
de ataque físico, o que torna a reversão física (`O_fis`) não confiável, e na
prática a maioria dos hits de amp kor é overkill (dano exibido truncado, inútil
para razão). O leech incide sobre o dano real pré-truncamento e é bimodal na mesma
razão `A` do bônus, então é o sinal disponível mesmo onde o dano não é. O dano dos
hits limpos serve apenas para pinar `A`. O mecanismo de saída (`row.tiers`,
`tier_base`/`tier_bonus`) é o mesmo já usado por Terra Burst/Ice Burst e Death Echo;
o split roda como pós-passe e não participa da seleção de partição.
## Requirements
### Requirement: Cada hit de Executioner's Throw carrega a decisão de tier de bônus por-hit

O motor Unified SHALL decidir, para cada hit de um bloco `Executioner's Throw`
(`exori amp kor`, elemento `physical`, área), se aquele hit teve o bônus condicional
por vida do alvo ativo (`amped`) ou não (`base`), e SHALL persistir essa decisão no
próprio objeto do hit (`executionerBonusActive`, `executionerBonusMultiplier`), de modo
que sobreviva em `turn.components[].hits[]` no resultado público de `classifyUnified`. O
bônus é binário por-hit; o multiplicador é fixo por sessão/personagem, um de
`{2.0, 2.25, 2.5}` (`+100%/+125%/+150%`, isto é, o hit com bônus dobra/2.25×/2.5× em
relação ao hit sem bônus do mesmo alvo). A atribuição de quais hits pertencem ao
componente `Executioner's Throw` (versus AA e outras spells do turno) já é feita pelo
motor e MUST NOT ser alterada por esta capability.

#### Scenario: Turno com 3 hits amped e 1 base é decidido corretamente

- **WHEN** o bloco `Executioner's Throw (exori amp kor)` do turno `15:21:16` da sessão
  `bastion` (`logs/bastion server log ek.txt` + `logs/bastion local chat ek.txt`,
  sessão `Sat Jun 13 2026`) contém 4 hits raubritter — `2243` chastener (leech 420),
  `1115` chastener (leech 184), `668` chastener (leech 423, overkill) e `340` marksman
  (leech 431, overkill)
- **THEN** os hits `2243`, `668` e `340` SHALL expor `executionerBonusActive === true`
  e o hit `1115` SHALL expor `executionerBonusActive === false` (3 amped + 1 base)

#### Scenario: A flag sobrevive no resultado público

- **WHEN** `classifyUnified` resolve um turno com componente `Executioner's Throw`
- **THEN** cada hit desse componente em `turn.components[].hits[]` SHALL carregar
  `executionerBonusActive` (`true`/`false`/`null`) e `executionerBonusMultiplier`
  (`2.0`/`2.25`/`2.5`/`1`), não apenas em diagnóstico interno descartado

### Requirement: O tier é decidido primariamente pelo leech por-turno, com canais separados, sem reversão física

O motor SHALL produzir a decisão preliminar de tier de bônus **pelo leech**, clusterizando os hits
do bloco de `Executioner's Throw` **por turno** (dentro de um mesmo cast). O leech incide
sobre o dano **real** (pré-truncamento por overkill) e é o único sinal disponível para a
maioria dos hits, porque na prática a maior parte dos hits de amp kor é overkill (dano
exibido truncado e inútil). Os canais de leech SHALL ser avaliados **separadamente**
(life leech e mana leech), nunca somados num único valor: cada canal é bimodal na mesma
razão `A` do bônus (um hit amped tem life leech ≈ `A×` e mana leech ≈ `A×` os de um hit
base do mesmo cast), e avaliar os canais em separado permite classificar um hit mesmo
quando um dos canais é zero (por exemplo life leech `0` porque o jogador estava com vida
cheia). A clusterização é **por turno** porque o valor de leech carrega o fator de área
(`0.1 + 0.9/N`, com `N` variando com o tamanho do pack por cast); dentro de um mesmo cast
o fator de área é constante, então o gap `~A×` entre base e amped é limpo. O motor
MUST NOT usar reversão física do dano para decidir o tier (um EK pode empunhar arma com
0% de ataque físico, tornando `O_fis` não confiável).

#### Scenario: Turno se separa pelo leech por-canal, não pelo dano

- **WHEN** o bloco de `Executioner's Throw` do turno `15:21:16` de `bastion` tem os hits
  `1115` (life `184`, mana `65`), `2243` (life `420`, mana `146`), `668 OK` (life `423`,
  mana `147`) e `340 OK` (life `431`, mana `128`)
- **THEN** o motor SHALL separar `1115` (life/mana no nível baixo) como `base` e `2243`,
  `668`, `340` (life/mana no nível alto ≈ `A×`) como `amped`, apesar de `668`/`340` terem
  dano truncado por overkill

#### Scenario: Hit com um canal de leech zero é classificado pelo outro canal

- **WHEN** um hit do bloco tem life leech `0` (vida cheia, nada a curar) mas mana leech
  num nível claramente base ou amped
- **THEN** o motor SHALL classificar o hit pelo canal de mana leech, sem exigir os dois
  canais

#### Scenario: Reversão física não é usada para decidir o tier

- **WHEN** o bloco `Executioner's Throw` é avaliado para tiers
- **THEN** a decisão `base`/`amped` MUST NOT depender de `O_fis`/reversão física dos hits

A emenda a M-034 SHALL dar precedência final a `overkill=true` de hit observado e não virtual, usando o marcador de overkill vigente de D-011a, que já não herda a XP de proc em outro mob nem de outro membro da party. Essa precedência SHALL operar após os passes de calibração existentes, sem fornecer novas amostras ao fallback de leech ou à escolha de A. Mesmo uma decisão preliminar base SHALL ser promovida. Sem overkill válido, o resultado preliminar SHALL permanecer inalterado.

#### Scenario: Overkill com cap tem precedência sobre base

- **WHEN** `tom S0` (sem data) `12:39:38` contém o skirmisher 1035 seq9930, com overkill válido e leech 382/61, preliminarmente base
- **THEN** o hit SHALL terminar amped, mantendo A1 S4 e os tiers dos hits não promovidos

#### Scenario: Quatro hits fatais do recorte já isolado

- **WHEN** o pós-passe recebe o componente amp kor isolado do recorte `10:24:56`, com 1027/70/617/541 e XP causal para cada hit
- **THEN** os quatro hits SHALL terminar amped mesmo quando o leech aponta base ou está ausente
- **AND** o AA 739 fora do componente SHALL permanecer intocado

#### Scenario: Hit virtual não recebe promoção por overkill estrutural

- **WHEN** um componente contém hit virtual de dano zero marcado como overkill por charm-kill
- **THEN** a política overkill para amped SHALL NOT promover esse placeholder
- **AND** o hit virtual SHALL conservar sua atribuição e tratamento anterior

### Requirement: O multiplicador A é fixo por log, restringido pelo teto de alvos e só desempatado pelo dano

O motor SHALL tratar o multiplicador `A` como **fixo por log** (uma única mastery por
personagem), resolvendo-o em duas etapas:

1. **Piso de cardinalidade (decisivo).** Descartar todo tier cujo teto de alvos seja menor
   que o maior bloco de `Executioner's Throw` observado na sessão — ver o requisito "O tier
   de mastery é restringido pelo teto de alvos do cast".
2. **Razão de dano (desempate).** Entre os tiers **sobreviventes**, ajustar (`snap`) ao mais
   próximo da razão `amped_dano / base_dano` de pares limpos (não-overkill) do mesmo cast,
   ou entre médias limpas da sessão.

A razão de dano **SHALL NOT** escolher sozinha entre os três níveis. Ela é **enviesada para
baixo por construção**: um hit `amped` mata — é o propósito do bônus de execute —, logo
aparece como **overkill** com dano truncado, e os únicos `amped` não-overkill são os rolls
mais fracos. O viés persiste até no espaço físico revertido (`evidence.physical.interval`,
que já normaliza crit/Low Blow, armadura e mitigação): `bastion`, cujo `A = 2.25` é
declarado, mede `2.02` ali. Um dano de overkill NÃO pode ser usado como se fosse o dano
cheio (é um piso, não o valor real).

O dano também NÃO é o sinal de classificação `base`/`amped` por hit — isso continua sendo o
leech por-canal, com a precedência final de overkill autorizada pela emenda a M-034. Quando não houver razão de dano nenhuma, `A` SHALL ser `null`.

#### Scenario: A resolve na mastery do log (bastion = 125% ⇒ 2.25)

- **WHEN** a sessão `bastion` (personagem com bônus `+125%`) é classificada
- **THEN** `executionerBonusMultiplier`/`row.bonusMult` do componente SHALL resolver em
  `2.25`, e MUST NOT usar `2243/1115 ≈ 2.01` como valor (o `2243` é overkill/truncado, um
  piso, não o dano amped real)

#### Scenario: o piso corrige o tier que a razão de dano errava (tom)

- **WHEN** a sessão `tom` é classificada, com 39 casts de amp kor, o maior com 4 hits
- **THEN** `×2.00` SHALL ser descartado pelo piso (teto de 3 alvos, contradito por 19 casts
  de 4 hits da própria sessão)
- **AND** `A` SHALL resolver em `2.25`
- **AND NOT** em `2.00`, que é o que a razão de dano `1.606` produzia sozinha

A promoção por overkill SHALL ocorrer somente após a seleção de A e SHALL NOT alimentar os níveis de leech usados pelo fallback. O multiplicador por hit SHALL refletir o tier final: A para amped quando A conhecido, null para amped quando A indeterminado; nunca 1 residual de um hit promovido.

#### Scenario: Promoção não recalibra mastery

- **WHEN** a promoção amped é aplicada sobre o resultado do motor atual
- **THEN** o A de cada sessão SHALL permanecer igual ao estado sem a promoção
- **AND** os novos amped SHALL receber esse A no multiplicador por hit

#### Scenario: Overkill sem A determinável

- **WHEN** um hit observado de amp kor tem overkill válido mas a sessão não permite determinar A
- **THEN** o hit SHALL ser amped com multiplicador null, sem inventar 2, 2.25 ou 2.5

### Requirement: O tier de mastery é restringido pelo teto de alvos do cast

O motor SHALL descartar, antes de escolher `A`, todo tier cujo teto de alvos seja **menor**
que o maior bloco de `Executioner's Throw` observado na sessão. Cada tier de mastery do
`exori amp kor` aumenta o número máximo de alvos junto com o multiplicador — `×2.00` → 3
alvos, `×2.25` → 4, `×2.50` → 5 —, então um bloco de `k` hits é evidência mecânica de que o
tier tem teto `≥ k`.

Quando **nenhum** tier sobrevive ao piso (bloco maior que todo teto conhecido), o motor SHALL
voltar a considerar os três níveis, para que um teto desatualizado na tabela não trave a
inferência.

#### Scenario: tom, tom 2 e bastion fecham em 2.25 pelo teto de 4 alvos

- **WHEN** cada uma das três sessões com `exori amp kor` é classificada
- **THEN** o maior bloco SHALL ter 4 hits em todas (39, 34 e 16 casts respectivamente)
- **AND** `A` SHALL ser `2.25` nas três
- **AND** `tom` e `tom 2` SHALL coincidir, porque são o **mesmo personagem** (`Kikaro`,
  level 1001 e 1002, sessões adjacentes do mesmo dia)

### Requirement: A dependência do piso na fronteira de componente é declarada

A documentação da regra SHALL registrar que a contagem que alimenta o piso vem do **bloco já
classificado**, não dos alvos do cast — o motor não observa "alvos", observa hits atribuídos a
um componente —, e que um auto-ataque fundido por engano dentro do bloco de amp kor infla a
contagem e empurra o tier **para cima**.

Isso é o **inverso** do viés da razão de dano, que empurra para baixo, então os dois erros
**não se cancelam**: um turno mal cortado troca um erro sistemático por outro. A documentação
da regra SHALL registrar essa dependência como consequência aceita, e SHALL NOT descrever o
piso como independente da classificação de turno.

#### Scenario: o próprio turno-alvo demonstra a dependência

- **WHEN** `tom 2` `12:58:06` é classificado **antes** da correção da guarda de `H-005g`
- **THEN** o bloco de `Executioner's Throw` tem 5 hits
- **AND** o piso cravaria `×2.50`, porque só esse tier alcança 5 alvos

### Requirement: Turno de tier único sem referência confiável fica indeterminado

O motor SHALL deixar indeterminado (`executionerBonusActive: null`, agrupado em `base`)
todo hit de um turno cujo bloco de `Executioner's Throw` não permite separar dois níveis
de leech (por exemplo um cast em que todos os hits são do mesmo tier, sem gap `~A×`, e sem
referência de nível confiável para aquele cast) e todo hit cujos dois canais de leech são
zero, salvo a precedência de overkill válido em hit observado e não virtual autorizada pela emenda a M-034. Nesse caso o motor MUST NOT forçar uma decisão de tier a partir
de níveis de leech de outros casts (o fator de área difere entre casts); a ambiguidade
SHALL ser registrada em vez de decidida silenciosamente.

#### Scenario: Cast de tier único não é fatiado por níveis de outro cast

- **WHEN** um cast de amp kor tem todos os hits no mesmo nível de leech (sem gap `~A×`
  interno) e não há referência confiável de nível para aquele cast
- **THEN** o motor SHALL atribuir `executionerBonusActive: null` (agrupado em `base`) aos
  hits desse cast, sem importar níveis de leech de casts com fator de área diferente

#### Scenario: Hit observado sem leech e com overkill válido fica amped

- **WHEN** um hit observado e não virtual do bloco tem life leech `0`, mana leech `0` e overkill causal válido
- **THEN** o motor SHALL atribuir `executionerBonusActive: true` pela política autorizada
- **AND** essa inferência SHALL NOT ser interpretada como prova de HP antes do hit

#### Scenario: Ausência de leech sem morte comprovada

- **WHEN** um hit não tem leech nem overkill válido e não há outra evidência de tier
- **THEN** o motor SHALL manter null, ainda agrupado como base pelo adaptador vigente

### Requirement: A linha de rotação de Executioner's Throw expõe sub-linhas base/amped

O adaptador de linhas de rotação (`js/unified-main.js`) SHALL agrupar os hits de um
componente `Executioner's Throw` (identificado pela ação `exori amp kor`, não por
heurística de dano) em `row.tiers = [{kind: 'tier_base', ...}, {kind: 'tier_bonus', ...}]`
sempre que ambos os tiers tiverem pelo menos um hit, reaproveitando o mesmo mecanismo de
sub-linhas já usado por Terra Burst/Ice Burst. `row.bonusMult` SHALL refletir o
multiplicador `A` resolvido pelo motor para o componente (`2.0`/`2.25`/`2.5`); se
diferentes turnos resolverem multiplicadores diferentes, a divergência SHALL ser
sinalizada (`row.bonusMultAmbiguous`) em vez de escolhida silenciosamente. Nenhuma
mudança em `js/app.js` é necessária (o mecanismo `row.tiers` já é genérico por
`tier.kind`).

#### Scenario: Linha com hits nos dois tiers ganha sub-linhas

- **WHEN** a tabela de rotação é construída para uma sessão cujo componente
  `Executioner's Throw` tem hits `amped` e hits `base`
- **THEN** a linha "Executioner's Throw (exori amp kor)" SHALL ganhar duas sub-linhas
  (`base`/`amped`) com hits médios e dano calculados apenas sobre os hits do tier
  correspondente, e `row.bonusMult` SHALL ser o multiplicador resolvido

#### Scenario: Componente com um único tier na sessão não gera sub-linha vazia

- **WHEN** todos os hits de `Executioner's Throw` da sessão estão no mesmo tier
- **THEN** `row.tiers` SHALL conter apenas o tier presente (ou ser omitido), nunca uma
  sub-linha com `hitsMean = 0` e sem hits reais

### Requirement: O split de tier roda como pós-passe e não altera a classificação de turno

O split `base`/`amped` SHALL rodar como um pós-passe sobre a partição já vencedora do
turno (o componente `Executioner's Throw` já isolado pelo motor), e MUST NOT participar
da pontuação/seleção de partição nem de qualquer decisão de qual hit pertence a qual
componente. A classificação de turno (status, partição vencedora, atribuição de hits a
componentes, AA vs spell, uptime) SHALL permanecer byte-idêntica à baseline; a única
diferença observável é a decisão de tier por-hit (`executionerBonusActive`/
`executionerBonusMultiplier`) e as sub-linhas derivadas na tabela de rotação. Se, num
turno, a atribuição atual não capturar todos os hits do componente, o split SHALL operar
apenas sobre os hits já atribuídos e MUST NOT disparar reatribuição/reclassificação do
turno.

#### Scenario: A classificação do turno é preservada bit a bit

- **WHEN** um turno com componente `Executioner's Throw` é resolvido antes e depois desta
  mudança
- **THEN** a partição vencedora, o status, a atribuição de hits a componentes e o uptime
  SHALL ser idênticos; apenas as flags de tier por-hit e as sub-linhas são adicionadas

#### Scenario: O split não reatribui hits faltantes

- **WHEN** a atribuição atual de um turno não coloca todos os hits de amp kor no
  componente `Executioner's Throw`
- **THEN** o split SHALL agir só sobre os hits já presentes no componente e MUST NOT
  alterar a partição para capturar hits faltantes

A baseline de isolamento da sublinha SHALL ser o motor imediatamente antes desta mudança. Comparar depois contra antes SHALL preservar status, partição, dono/ordem/dano dos hits, N, casts, setup e A; somente tiers, multiplicadores correspondentes e métricas derivadas SHALL mudar. Esta mudança SHALL NOT alterar `parseServerFacts`.

#### Scenario: A promoção não move partição

- **WHEN** o corpus é medido antes e depois da promoção
- **THEN** nenhuma mudança de status, partição, setup ou A SHALL existir
- **AND** as únicas diferenças SHALL ser `executionerBonusActive`/`executionerBonusMultiplier` de hits de amp kor e as sub-linhas derivadas

### Requirement: Zero-drift fora de Executioner's Throw

Esta capability MUST NOT alterar nenhum resultado em qualquer fixture ou sessão sem
componente `Executioner's Throw` (`exori amp kor`). Partições, status, componentes, dano
base, uptime e linhas de rotação permanecem idênticos aos anteriores, incluindo a
ausência de `row.tiers` nessas linhas. As sub-linhas de Terra Burst/Ice Burst e de Death
Echo MUST NOT ser afetadas.

#### Scenario: Fixtures sem Executioner's Throw permanecem idênticos

- **WHEN** o diagnóstico/avaliação roda sobre um fixture cujos turnos não contêm nenhum
  componente `Executioner's Throw` em nenhuma sessão
- **THEN** a saída SHALL ser idêntica à baseline anterior à mudança (diff vazio)

#### Scenario: Terra Burst/Ice Burst e Death Echo não são afetados

- **WHEN** o diagnóstico roda sobre um fixture com Terra Burst, Ice Burst ou Death Echo
- **THEN** as sub-linhas e decisões de tier dessas spells SHALL permanecer idênticas à
  baseline anterior a esta mudança

### Requirement: Golpe sem linha de mana recebe o tier do golpe do mesmo mob e estado no mesmo cast

O motor SHALL dar, depois da precedência do overkill, a um hit observado do componente
`Executioner's Throw` que não é overkill e não tem linha de mana (`manaLeech = 0`: a mana estava
cheia, e o canal primário de M-034 não diz nada) o tier de outro hit do mesmo cast, do mesmo mob e estado (a
chave de M-034b: mob, crítico, Expose Weakness, Bounty, prey), que tenha **dano real exato**
pelo leech (vida e mana concordam) e tier já decidido. O dano real do hit sem mana é o dano
mostrado (ele não é overkill), sem os multiplicadores que ficam fora da base de leech. Razão
entre os dois abaixo de `EXEC_LEECH_GAP` nos dois sentidos dá o mesmo tier; razão a partir do
gap dá o outro tier. Com dois ou mais desses hits votando tiers diferentes, ou sem nenhum, o
resultado anterior SHALL permanecer. A vida do hit sem mana NÃO SHALL decidir o tier contra
esse par, porque ela é capada pela vida que falta ao jogador. A decisão NÃO SHALL alimentar a
calibração de mana nem a escolha de `A`, e NÃO SHALL usar reversão física.

#### Scenario: tom 12:26:25, marksman 2681 com bônus

- **WHEN** `tom` S0 (sem data) `12:26:25` tem o bloco de 4: `marksman 809 OK` e `marksman 1524
  OK` (vida 423, mana 128 cada: dano real exato 2443–2446 a `N = 4`), `skirmisher 2576` (vida
  381, mana 105) e `marksman 2681` (vida 190, sem linha de mana), e o `2681` não é overkill
- **THEN** o `2681` SHALL terminar `amped` com multiplicador `2,25` (razão 2681/2445 ≈ 1,10,
  o mesmo nível dos dois marksman cortados), e não `base` pela vida 190
- **AND** o turno SHALL continuar `A1 S4`

#### Scenario: Par em base

- **WHEN** `tom 2` S0 `13:05:14` tem `chastener 1139 OK` (vida 442, mana 142: dano real exato
  ≈ 2725) e `chastener 1293` sem linha de mana
- **THEN** o `1293` SHALL terminar `base` (razão ≈ 0,47, no gap)

#### Scenario: Irmão sem dano real exato não vota

- **WHEN** o único hit do mesmo mob e estado tem vida e mana discordantes (ex.: `tom` `12:36:19`,
  `marksman 1230 OK` com vida 427 e mana 77)
- **THEN** o hit sem linha de mana (`marksman 1105`) SHALL conservar o tier anterior
