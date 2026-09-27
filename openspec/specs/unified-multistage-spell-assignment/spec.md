# unified-multistage-spell-assignment Specification

## Purpose

Define como o motor Unified reconhece spells que produzem, a partir de um
único cast concreto, um blast inicial de potência integral e um estágio
atrasado que aterrissa depois do timestamp terminal do blast inicial —
consolidando os dois estágios sob a mesma ação/cast, sem ancorar ou deslocar
o próximo turno independente, e sem inventar hit ou dano virtual quando a
evidência mecânica não fecha. Duas spells multiestágio são conhecidas
atualmente: Death Echo (`exevo mort ora`, sorcerer) e Spiritual Outburst
(`exori gran mas nia`, monk), cada uma com seus próprios parâmetros
declarativos de delay(s) e potência(s) candidata(s).
## Requirements
### Requirement: Death Echo é uma única spell de área com dois estágios

O motor Unified SHALL tratar o cast concreto `exevo mort ora` de sorcerer como a ação ofensiva `Death Echo`, de elemento death e topologia de área, composta por um blast inicial de potência integral e um echo de potência 50%. Death Echo SHALL ser uma das spells multiestágio conhecidas pelo perfil declarativo; `exori gran mas nia` (Spiritual Outburst) é a segunda spell multiestágio conhecida, com parâmetros próprios (ver requisito "Spiritual Outburst declara delay e potência candidatos"). Os dois estágios de Death Echo MUST permanecer ligados ao mesmo cast e à mesma ação concreta, com delay candidato único `[1]` e potência candidata única `[1/2]`, em conformidade com R-001, M-005, M-011, M-012, M-013, M-015, T-003, T-004, N-003, N-007, N-008 e N-009.

#### Scenario: Dois estágios no mesmo turno observado
- **WHEN** o Unified classifica `death echo 11:06:20`, com cast `exevo mort ora` em `11:06:20`, AA de um hit, blast inicial em `:20` e hits de echo em `:21` com metade do dano do blast inicial para o mesmo mob e estado
- **THEN** o turno SHALL resolver como `A1 + Death Echo`, contendo os dois estágios sob a mesma ação e sem criar uma segunda spell

#### Scenario: Outras spells sem perfil declarado continuam single-stage
- **WHEN** o perfil da ação ofensiva não declara mecânica multiestágio, inclusive `exori gran mas pug` (Greater Flurry of Blows)
- **THEN** o Unified MUST manter a janela, a formação de turno e a atribuição single-stage atuais, sem inferir echo por mera queda de dano entre segundos adjacentes

### Requirement: O echo exige evidência mecânica conjunta

O motor SHALL atribuir um bloco atrasado ao estágio declarado somente quando houver cast concreto da spell multiestágio, um blast inicial já identificado, impacto atrasado em um dos segundos candidatos declarados no perfil (contados a partir do timestamp terminal do blast inicial, tentados em ordem — o primeiro segundo candidato com pelo menos um hit não-overkill é o único avaliado; o motor MUST NOT continuar tentando delays candidatos maiores depois de encontrar candidatos em um delay menor, mesmo que a prova falhe nesse segundo), compatibilidade de elemento/topologia/estado e potência demonstrada pela transformação discreta do dano entre hits comparáveis, usando uma dentre as frações candidatas declaradas no perfil daquela spell. A comparação MUST respeitar modificadores, crítico, overkill e arredondamento conforme D-001 a D-010c; ela MUST NOT usar média solta, tolerância nova, limiar arbitrário ou horário específico.

A avaliação de uma fração candidata SHALL classificar cada hit não-overkill do bloco candidato em exatamente uma destas categorias:

- **Casado** — existe no blast inicial um hit comparável (mesmo mob e mesmo estado de modificadores, com original elemental calculável nos dois lados) e a transformação discreta fecha sob a fração candidata.
- **Contraditório** — existe hit comparável no blast inicial, mas a transformação discreta **não** fecha sob a fração candidata.
- **Sem contraparte** — não existe hit comparável no blast inicial (o mob não aparece no blast, ou sua única presença ali é overkill, dodge de dano zero ou original não calculável).

Em sessão de sorcerer com estância conhecida (M-043), o **primeiro** hit da janela do blast (em ordem de `seq`) MUST NOT ser tratado como hit comparável quando os **demais** hits da janela têm um original comum a pelo menos dois mobs distintos no elemento previsto (nível do blast, com a tolerância de `elementalBlockTolerance`) e nenhum original desse primeiro hit fica dentro dessa tolerância do nível. Só o primeiro hit pode ser o auto ataque do ciclo (V-011, M-032), e um auto ataque não é hit do blast. Nenhum outro hit da janela é excluído: o mesmo mob pode aparecer no blast em mais de um nível observado (`alumnishocks` S0 `19:01:11`, `wardragon` 757 e 739 em energy), e cada um continua comparável.

Uma fração candidata SHALL ser rejeitada quando **qualquer** hit for classificado como contraditório. Hits **sem contraparte** MUST ser tratados como evidência ausente conforme D-006 e MUST NOT, por si sós, rejeitar a fração candidata — a ausência de um hit comparável no blast não é prova de que a relação de potência falhou. Todos os hits **casados** MUST fechar contra a MESMA fração candidata — um bloco não pode ser explicado por duas frações diferentes simultaneamente, pois uma única explosão tem uma única potência.

Os originais da prova SHALL ser reconstruídos no elemento efetivo previsto pela máquina de conversão de M-043. Quando, nesse elemento, algum par comparável não fecha (inclusive um par que seria desculpado por outro cast concreto no segundo do eco), e no elemento alternativo (nativo ou estância, nunca um terceiro) **todos** os pares comparáveis fecham, a prova SHALL usar o alternativo, mantendo o conjunto de hits comparáveis decidido no elemento previsto. Motivo medido: o eco sai cerca de 1 ponto de dano acima da metade exata, e a folga de 1 ponto de original de D-010a absorve isso em death (`darklight source` 1184 → 593: originais 1200 → 601) mas não em fire (1048 → 526), porque o passo de arredondamento depende do modificador do elemento. Sem estância conhecida, o elemento da prova SHALL ser o do perfil, como antes.

Uma fração candidata SHALL vencer somente quando houver pelo menos um hit casado e nenhum hit contraditório; a queda de dano de um bloco composto exclusivamente por hits sem contraparte MUST NOT confirmar estágio algum. Esta avaliação por categorias SHALL aplicar-se somente a perfis cuja confirmação declarada é elemental (M-016d-1); perfis cuja confirmação declarada é por cluster de leech (M-016e, Spiritual Outburst) MUST NOT ser confirmados por esta via elemental, permanecendo para o passe de correção posterior que usa o leech real.

Evidência insuficiente SHALL permanecer explícita como componente não resolvido e MUST NOT inventar hits, conforme R-001, R-003, D-006, S-004, S-005, S-012, S-013, H-001, H-002 e C-005.

#### Scenario: Relação de metade confirma o echo cross-turno
- **WHEN** o blast inicial de `death echo 11:06:08` produz, no mesmo estado comparável, danos `870` em roaming dread, `820` em cyclursus e `800` em crypt mage, e o bloco de `11:06:10` produz respectivamente `435`, `409/410` e `400` após a transformação discreta aplicável
- **THEN** o bloco de `:10` SHALL ser atribuído ao echo do cast `exevo mort ora` de `11:06:09`, e MUST NOT ser nomeado como Energy Wave nem como ação independente

#### Scenario: Hit de eco sem contraparte no blast não derruba a confirmação
- **WHEN** o cast `exevo mort ora` de `kim 16:22:16` produz blast `undertaker 1070` em `:16` e o segundo do eco `:17` contém `undertaker 535` (metade exata do blast, casado) e `stalking stalk 449`, cujo mob não possui hit comparável no blast (a única presença de outro mob no blast é um dodge de dano zero)
- **THEN** o `stalking stalk 449` SHALL ser tratado como evidência ausente (D-006), a fração `1/2` SHALL vencer pelo par casado do `undertaker`, os hits do segundo do eco SHALL receber o estágio atrasado do cast, e o turno MUST NOT terminar como `unresolved` por `same_mob_state_exact_original_mismatch`

#### Scenario: Hit comparável que não fecha continua rejeitando a fração
- **WHEN** um hit do segundo do eco possui hit comparável no blast inicial (mesmo mob, mesmo estado, originais calculáveis dos dois lados) e a transformação discreta não fecha sob a fração candidata
- **THEN** essa fração candidata MUST ser rejeitada, mesmo que outros pares do bloco fechem sob ela

#### Scenario: Bloco sem nenhum par casado não confirma estágio
- **WHEN** nenhum hit do segundo candidato possui contraparte comparável no blast inicial, de modo que não existe par casado algum
- **THEN** o motor MUST NOT confirmar o estágio atrasado por ausência de contradição, e o bloco SHALL seguir pela classificação normativa ordinária

#### Scenario: Tier candidato é escolhido pelo fechamento discreto, não por ordem de declaração
- **WHEN** o blast inicial de `exori gran mas nia` em `monk 2 07:19:35` produz danos como `1523` (chastener) e `1517` (chastener), e o bloco de `07:19:36` produz respectivamente `947` e `934`
- **THEN** o Unified SHALL testar as frações candidatas `[3/8, 1/2, 5/8]` do perfil e consolidar o bloco de `:36` como estágio atrasado somente sob a fração `5/8` (Stage 3), a única que fecha a transformação discreta para todos os hits comparáveis do bloco

#### Scenario: Confirmação por cluster de leech não é preemptada pela via elemental
- **WHEN** o cast avaliado é `exori gran mas nia` (Spiritual Outburst), cujo perfil declara confirmação por cluster de leech, e algum par de hits coincidentemente fecharia uma fração candidata pela reversão elemental
- **THEN** a via elemental MUST NOT confirmar o estágio atrasado dessa spell, que SHALL permanecer para o passe de correção posterior baseado no leech real, preservando M-016e

#### Scenario: Queda de dano sem prova não cria echo
- **WHEN** hits em segundos adjacentes têm magnitudes aproximadamente diferentes, mas falta cast concreto de spell multiestágio, blast inicial compatível ou fechamento discreto de alguma fração candidata entre hits comparáveis
- **THEN** o Unified MUST NOT classificar o bloco posterior como echo e SHALL continuar pela classificação normativa ordinária ou retornar componente não resolvido

#### Scenario: Overkill não prova nem contradiz sozinho a potência
- **WHEN** um hit candidato do blast inicial ou do echo está marcado como overkill e seu dano exibido está truncado
- **THEN** esse hit MUST NOT ser usado sozinho para provar ou rejeitar a relação de potência de nenhuma das frações candidatas, preservando D-011, D-013, D-018, D-025 e D-026

#### Scenario: o auto ataque na janela do blast não derruba o eco

- **WHEN** `alumnishocks 2` S0 (`21/Sep/2026`, estância `energy`) tem, no segundo do cast `exevo mort ora` de `18:24:39`, o AA `wardragon 70` (seq 2300) antes do blast `dragolisk 790` ×3 e `mega dragon 868` (original 786 em energy nos dois mobs), e o eco de `18:24:40` traz `wardragon 414`
- **THEN** o `wardragon 70` MUST NOT ser comparável, a fração `1/2` SHALL vencer, e o turno SHALL resolver como `A1` (`wardragon 70`) `+ Death Echo 10` (blast de 5 em `:39` com o `dragolisk 337 OK`, eco de 5 em `:40`)

#### Scenario: o arredondamento do elemento convertido não quebra o eco

- **WHEN** `dlc ms` S0 (estância `fire`, Death Echo `converted`) tem o blast `darklight source 1184` e o eco `darklight source 593` em `21:37:23`/`:24`
- **THEN** a prova SHALL fechar pelo elemento alternativo (`death`) e o turno SHALL continuar `A0 + Death Echo 18`, como antes desta mudança

### Requirement: Echo atrasado não ancora nem desloca o próximo turno

Antes de escolher a âncora do próximo bloco mecânico de dois segundos, o motor SHALL consolidar qualquer bloco comprovado como estágio atrasado com o componente multiestágio originário, mesmo quando esse segundo também contém hits de um cast concreto diferente e legítimo landando na mesma janela. Os hits do estágio atrasado continuam observados, classificados e contabilizados na ação originária, mas MUST NOT iniciar um novo turno, deslocar a próxima âncora ou absorver AA/spell do ciclo seguinte — incluindo AA/spell de uma spell diferente que compartilhe o mesmo segundo. Esta exceção de efeito atrasado SHALL aplicar-se somente a estágios declarados no perfil multiestágio e preserva M-001, M-002, M-003, M-005, T-001, T-002, T-003 e T-004 para ações independentes.

#### Scenario: Echo em 11:06:10 não desloca o turno seguinte
- **WHEN** os hits de `death echo 11:06:10` são consolidados como o echo do Death Echo iniciado no turno `11:06:08`
- **THEN** a próxima âncora independente SHALL ser `11:06:11`, contendo um AA de `130` e os dez hits de `Energy Wave (exevo vis hur)`, em vez de um turno ancorado em `11:06:10`

#### Scenario: Estágio atrasado convive com um cast real diferente no mesmo segundo
- **WHEN** o cast `exori gran mas nia` de `monk 2 07:19:56` tem blast inicial em `:56` sem candidato em `:57` (delay `1` sem hits), o estágio atrasado é encontrado em `:58` (delay `2`) fechando a transformação discreta sob uma fração candidata, e o mesmo segundo `:58` também contém um cast concreto e distinto de `exori gran mas pug` (Greater Flurry of Blows)
- **THEN** os hits do estágio atrasado de Spiritual Outburst SHALL ser consolidados sob o cast de `:56`, os hits restantes de `:58` (AA e Greater Flurry of Blows) SHALL formar o turno independente `07:19:58` normalmente, e nenhum hit MUST pertencer a mais de um componente

#### Scenario: Echo permanece na ação originária
- **WHEN** um echo comprovado cai fora da janela mecânica de dois segundos que contém o blast inicial
- **THEN** todos os hits do echo SHALL permanecer associados ao componente e ao cast originários para trace, rotação, dano e cardinalidade, sem criar uma segunda execução da spell

### Requirement: Blast e estágio atrasado ficam no mesmo turno

O motor Unified SHALL consolidar o blast inicial e o estágio atrasado de um mesmo cast
multiestágio (M-016d) no **mesmo turno** — o turno do blast. Um cast multiestágio MUST NOT
produzir componentes em dois turnos distintos, mesmo quando o estágio atrasado aterrissa
num segundo pertencente ao bucket do turno seguinte (M-015/N-007/N-008, M-016d).

Quando o segundo candidato ao estágio atrasado contém **somente hits de overkill**, esse
segundo SHALL acompanhar a explosão e ser consolidado no turno do blast, em vez de ser
pulado. M-016d-1a já declara que "hits sem contraparte e overkills continuam acompanhando a
explosão"; o gate guloso de M-016d-1 — que avalia somente o primeiro segundo com pelo menos
um hit não-overkill — MUST NOT deixar um estágio atrasado só-overkill órfão num turno
separado, porque isso reutiliza o cast em dois turnos.

Dano de overkill truncado continua não provando nem contradizendo a transformação de
potência declarada, e a consolidação MUST NOT inventar hit nem dano virtual (D-006): nenhum
hit do bloco só-overkill recebe marcação de fração/tier. A exceção SHALL valer somente
quando o perfil declara uma **única** fração candidata — com duas ou mais haveria uma
escolha real a fazer sem evidência, e o motor continua não decidindo.

#### Scenario: Estágio atrasado só de overkill não vira turno separado

- **WHEN** um cast multiestágio tem seu blast num turno e o único segundo candidato ao
  estágio atrasado contém apenas hits de overkill do dono
- **THEN** o motor SHALL consolidar esses hits no turno do blast
- **AND** MUST NOT produzir um segundo turno cujo componente aponte para o mesmo cast

#### Scenario: Caso de validação kim 16:24:28

- **WHEN** o motor classifica `kim` (sessão salva `14/Jul/2026 16:43:45`), em que o dono
  casta `exevo mort ora` em `16:24:29`, com blast `889` em `stalking stalk` em `16:24:29` e
  um único hit `172` de **overkill** no mesmo mob em `16:24:30`
- **THEN** o turno `16:24:28` SHALL ser `A1 S2` — auto-ataque mais o blast e o estágio
  atrasado do cast de `16:24:29`
- **AND** MUST NOT existir um turno `16:24:30` carregando o mesmo cast

### Requirement: Casos-gabarito e regressões são verificáveis pelo Unified

O par de logs `logs/monk 2 server log.txt` / `logs/monk 2 local chat.txt` (sem cabeçalho de sessão/data) SHALL fazer parte do gabarito do Unified, validado pelo diagnóstico canônico `tools/diag-unified-turn.mjs`. A capability MUST permanecer no motor Unified, sem tocar UI (fora do reuso já precedente do mecanismo de sub-linhas de tier) ou motores legados, e MUST preservar os gabaritos existentes conforme R-004, C-002, C-011 e U-015. Os tiers `3/8` e `1/2` de Spiritual Outburst, sem evidência real de log até esta mudança, SHALL ter cobertura por teste sintético/unitário e SHALL estar documentados como risco residual em `docs/CLASSIFICATION_RULES.md`.

#### Scenario: Tríade obrigatória do Death Echo
- **WHEN** as avaliações rodam sobre `logs/death echo server log.txt` e `logs/death echo local chat.txt`, sessão salva em `10/Jul/2026`
- **THEN** `11:06:08` SHALL resolver como `A1 + Death Echo` com seu echo atrasado de `:10`, `11:06:11` SHALL resolver como `A1 + Energy Wave`, e `11:06:20` SHALL resolver como `A1 + Death Echo` com blasts integral e 50%

#### Scenario: Casos obrigatórios de Spiritual Outburst
- **WHEN** as avaliações rodam sobre `logs/monk 2 server log.txt` e `logs/monk 2 local chat.txt`
- **THEN** `07:19:35` SHALL resolver como `A1 + Spiritual Outburst` com blast inicial em `:35` e estágio atrasado (Stage 3, `5/8`) consolidado em `:36` no mesmo turno, e `07:19:56` SHALL resolver como `A1 + Spiritual Outburst` com blast inicial em `:56` e estágio atrasado (Stage 3, `5/8`) consolidado a partir de `:58` (delay `2`), preservando o turno independente `07:19:58` com seu próprio AA e `Greater Flurry of Blows`

#### Scenario: Suíte obrigatória permanece verde
- **WHEN** a implementação estiver completa
- **THEN** `python tools/run_classifier_evals.py` e `pytest tests/test_classifier_golden.py tests/test_classification_rules.py` MUST passar sem alterar expectativas não relacionadas para mascarar regressões

### Requirement: Spiritual Outburst declara delay e potência candidatos

O perfil canônico de `exori gran mas nia` (Spiritual Outburst, monk, holy, área) SHALL declarar um estágio atrasado com delay candidato `[1, 2]` segundos após o timestamp terminal do blast inicial e potência candidata `[3/8, 1/2, 5/8]` (Stage 1, Stage 2, Stage 3), reaproveitando a mesma estrutura declarativa `multiStage` de Death Echo — sem ramo por vocação, horário, dano ou fixture, e sem alterar os parâmetros de Death Echo.

#### Scenario: Delay tentado em ordem, primeiro segundo com candidatos vence
- **WHEN** o blast inicial de `exori gran mas nia` termina em um timestamp `T` e o segundo `T+1` não contém nenhum hit não-overkill do jogador
- **THEN** o motor SHALL avançar para o segundo `T+2` como único candidato a estágio atrasado para aquele cast, sem tentar `T+3` ou segundos posteriores

#### Scenario: Delay 1 é preferido quando tem candidatos
- **WHEN** o blast inicial de `exori gran mas nia` termina em um timestamp `T` e o segundo `T+1` contém hits não-overkill do jogador
- **THEN** o motor SHALL avaliar apenas `T+1` como candidato a estágio atrasado para aquele cast, sem considerar `T+2`, mesmo que a prova em `T+1` falhe

### Requirement: Sub-linhas de tier expõem o estágio resolvido do Spiritual Outburst

A tabela de rotação SHALL exibir o Spiritual Outburst com sub-linhas de blast inicial e estágio atrasado, reaproveitando o mecanismo de `row.tiers` já usado por Death Echo/Terra Burst/Ice Burst. A sub-linha do estágio atrasado MUST comunicar qual tier (Stage 1, Stage 2 ou Stage 3) foi resolvido para os turnos agregados nela, diferente do rótulo fixo único usado pelo echo de Death Echo.

#### Scenario: Sub-linha nomeia o tier resolvido
- **WHEN** um turno de Spiritual Outburst é classificado com estágio atrasado em Stage 3 (fração `5/8`)
- **THEN** a sub-linha correspondente na tabela de rotação SHALL indicar Stage 3, e não um rótulo genérico de "segunda explosão" sem tier

#### Scenario: Ausência de um dos estágios não cria sub-linha vazia
- **WHEN** um turno de Spiritual Outburst só tem blast inicial comprovado, sem estágio atrasado consolidado
- **THEN** a linha permanece única, sem sub-linhas, mesmo guard já usado por Terra Burst (`if (!baseHits.length || !bonusHits.length) return;`)

### Requirement: Declared multi-stage evidence can explain an apparent AA prefix

When a concrete cast of a declared multi-stage spell is in the normative cast window and the observed hits around the turn contain a valid stage relation under that spell's declared confirmation mechanism, the Unified engine SHALL allow that multi-stage evidence to explain an apparent first-hit AA prefix before finalizing an `A1 + spell` split. This requirement does not create a new spell rule: confirmation MUST use the spell's existing declared profile and proof path from `docs/CLASSIFICATION_RULES.md`.

For Death Echo, confirmation MUST use the existing death-element discrete reconstruction, the fixed `1/2` echo fraction, and the matched/contradictory/no-counterpart categories already defined for M-016d-1a. For Spiritual Outburst, this contract is intentionally not wired by this change: its confirmation is the later M-016e leech-cluster correction pass, and adding it safely requires a separate implementation with its own target case.

A first hit that participates in a confirmed declared primary blast MUST NOT be consumed as AA merely because it lands one second before the remaining primary hits or because its leech is compatible with `N=1`, when the same hit is mechanically explained by the concrete multi-stage cast. For Death Echo, hits in the candidate echo second that have no comparable primary hit remain evidence absent and MUST NOT reject a `1/2` fraction that has at least one matched pair and no contradictory pair.

#### Scenario: Kim Death Echo half-power pair blocks leech-forced AA

- **WHEN** the Unified engine classifies `kim` session `14/Jul/2026 16:43:45`, turn `16:30:47`, with cast `exevo mort ora` at `16:30:47`, primary hit `undertaker 566` at `:47`, and echo-second hits `undertaker 282` and `sulphider 378` at `:48`
- **THEN** the `undertaker 566 -> 282` matched `1/2` pair SHALL confirm the Death Echo relation, the `sulphider 378` no-counterpart hit SHALL NOT reject it, and the turn SHALL classify as `A0 + Death Echo` with 3 spell hits

#### Scenario: DLC MS primary blast crossing timestamp boundary blocks timestamp-forced AA

- **WHEN** the Unified engine classifies `dlc ms` session `17/Jul/2026 21:45:48`, turn `21:41:33`, with cast `exevo mort ora` at `21:41:34`, primary hit `walking pillar 1481` at `:33`, additional primary hits at `:34`, and echo hits at `:35`
- **THEN** the Death Echo primary/echo evidence SHALL be evaluated before accepting the `:33 -> :34` timestamp edge as independent AA evidence, and the turn SHALL classify as `A0 + Death Echo` with all observed Death Echo hits in the spell component

#### Scenario: Existing true Death Echo AA controls remain valid

- **WHEN** the Unified engine classifies the existing `death echo` fixture turns `11:06:08`, `11:06:11`, and `11:06:20`
- **THEN** their current gabarito classifications SHALL remain valid, including real AA prefixes where the first hit is not explained away by the Death Echo stage relation

#### Scenario: Spiritual Outburst remains future work in this change

- **WHEN** a future turn with `Spiritual Outburst (exori gran mas nia)` shows the same apparent AA-prefix pattern
- **THEN** this generic requirement SHALL be satisfied only after a separate implementation wires the M-016e leech-cluster confirmation pass into the AA evidence gate; this Death Echo change MUST NOT infer Spiritual Outburst stages by Death Echo's elemental proof

### Requirement: Outro cast concreto no segundo do estágio atrasado dissolve a contradição

T-002 declara que o segundo do estágio atrasado PODE conter, legitimamente, hits de um cast concreto diferente. A categorização de M-016d-1a SHALL considerar esse fato ao decidir se um hit que não fecha sob a fração candidata é **contradição**.

Quando existe outro cast ofensivo concreto do dono cuja janela normativa (M-012/M-013)
cobre o segundo do estágio atrasado, um hit comparável que não fecha sob a fração SHALL ser
tratado como evidência **daquele** cast e MUST NOT rejeitar a fração. Quando não existe
outro cast assim, nada além do estágio atrasado poderia ter produzido aquele hit e a
contradição MUST permanecer real — a regra atual segue inalterada nesse caso.

A fração continua exigindo pelo menos um par casado, e todos os pares casados continuam
tendo de fechar sob a **mesma** fração.

Nesse segundo compartilhado, a consolidação SHALL restringir-se aos pares **casados**. Hits
sem contraparte e overkills, que num segundo exclusivo do estágio atrasado acompanham a
explosão, passam a ser ambíguos entre as duas explosões, e evidência ausente MUST NOT
decidir dono (D-006).

#### Scenario: eco divide o segundo com outra spell de área

- **GIVEN** `dlc ms` S0, cast `exevo mort ora` em `21:35:27` com blast
  `source 1167`, `matter 1578`, `pillar 1468`, e cast `exevo gran flam hur` em `21:35:29`
- **WHEN** o motor avalia a fração `1/2` no segundo `21:35:29`, que contém tanto o eco
  (`583`, `788`, `733`) quanto o bloco do Great Fire Wave (`1546`, `2092`, `1947`)
- **THEN** os hits do Great Fire Wave MUST NOT rejeitar a fração
- **AND** o estágio atrasado SHALL consolidar os cinco hits casados no turno de `21:35:27`
- **AND** `21:35:29` SHALL resolver como o bloco de `Great Fire Wave` com os 7 hits
  restantes

#### Scenario: segundo exclusivo do eco mantém a contradição

- **GIVEN** um segundo de estágio atrasado sem nenhum outro cast ofensivo concreto do dono
  cuja janela o cubra
- **WHEN** um hit comparável não fecha sob a fração candidata
- **THEN** a fração MUST ser rejeitada, como hoje

### Requirement: Confirmação por cluster de leech pertence a quem a declara

A passada de correção que confirma estágio atrasado por **cluster de razão de leech** (M-016e) SHALL rodar somente para perfis cuja confirmação declarada é `leech_cluster` — hoje apenas Spiritual Outburst. É o espelho do guard que a via elemental já possui (M-016d-1b).

Um perfil que declara confirmação **elemental** MUST NOT ter seu estágio atrasado
consolidado por magnitude de cluster quando a via elemental não fecha. Consolidar por essa
via produz atribuição **parcial** — o cluster de leech separa mobs com e sem prey, e só
parte do estágio atrasado é movida —, deixando o restante no turno seguinte com o mesmo mob
em dois níveis e matando esse turno no veto same-mob de S-004a.

#### Scenario: Death Echo não é consolidado por cluster de leech

- **WHEN** a via elemental não confirma o estágio atrasado de um cast de `exevo mort ora`
- **THEN** a passada de cluster de leech MUST NOT consolidá-lo
- **AND** o cast SHALL permanecer sem estágio atrasado consolidado, com todos os hits
  preservados e auditáveis

#### Scenario: Spiritual Outburst continua usando a via que declara

- **WHEN** o cast é `exori gran mas nia`, cujo perfil declara `confirmation: 'leech_cluster'`
- **THEN** a passada de correção por cluster de leech SHALL continuar consolidando seu
  estágio atrasado exatamente como antes

### Requirement: A primeira explosão rotula o blast inteiro

Quando a prova de estágio de M-016d-1a confirma a fração por potência, em sessão de sorcerer com estância conhecida, o rótulo de primeira explosão (`primary`) SHALL cobrir, além dos hits casados, todo hit não-overkill da janela do blast que seja idêntico a um hit casado: mesmo mob, mesmo estado de modificadores (`elementalStateKey`) e mesmo dano exibido. O primeiro hit excluído como possível auto ataque MUST NOT receber o rótulo. Overkill MUST NOT receber o rótulo por esta via: ele herda o bloco contíguo (D-012), e rotulá-lo poderia puxar um auto ataque em overkill para dentro da spell (`kim` `16:25:13`, `nighthunter 61 OK`, que o leech declara `N = 1`).

#### Scenario: blast inteiro rotulado

- **WHEN** `alumnishocks 2` S0 classifica o Death Echo de `18:25:47`, com `dragolisk 790` ×2 e `wardragon 828` ×3 no blast
- **THEN** os 5 hits do blast SHALL receber o rótulo `primary`, e os 10 do eco o rótulo `echo`

#### Scenario: AA em overkill não é puxado para a spell

- **WHEN** `kim` S0 classifica `16:25:13`, cujo primeiro hit é `nighthunter 61 CRIT OK` (leech declara `N = 1`)
- **THEN** esse hit MUST NOT receber o rótulo `primary`, e o turno SHALL continuar `A1 + Death Echo 9`
