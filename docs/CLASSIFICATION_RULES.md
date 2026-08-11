# Regras do classificador

## 1. Finalidade do classificador

- **R-001 — Dados observados:** usar somente ações, hits e danos presentes nos logs. Não simular ataques, dano ou rotações.
- **R-002 — Fontes:** o Server Log fornece hits, dano, runas, modificadores e leech; o Local Chat fornece casts e identidade do jogador.
- **R-003 — Fatos e inferências:** distinguir fato observado, evidência mecânica, classificação inferida e caso não resolvido.
- **R-004 — Regra normativa:** uma implementação está errada quando viola este documento, mesmo que reproduza o classificador antigo.
- **R-005 — Vocabulário:** “deve”, “não deve” e “pode” possuem sentido normativo.

## 2. Mecânica do jogo

### Ciclo de ataque

- **M-001 — Duração:** o ciclo de auto ataque dura 2 segundos.
- **M-002 — Um AA por ciclo:** não pode haver duas instâncias de AA no mesmo ciclo.
- **M-003 — Cooldown:** após um AA confirmado, hits antes do próximo ciclo não podem ser outro AA.
- **M-004 — Ordem:** em alvo único, a ordem normal é AA → spell/runa → granada.
- **M-005 — Timestamp:** hits do mesmo turno podem aparecer em segundos diferentes.

### Topologia das ações

- **M-006 — Single-target:** uma instância single-target produz no máximo um hit.
- **M-007 — Área:** uma ação de área pode produzir um ou vários hits.
- **M-008 — Área unitária:** uma ação de área que atingiu somente um alvo continua válida.
- **M-009 — Boss único:** contra boss sem artigo, cada instância de ação produz no máximo um hit.
  - **M-009a — Detecção de boss por-mob via ausência de artigo:** um mob é "boss" (para fins de
    M-009/M-010, M-026 e M-030–M-033) quando **todas** as suas ocorrências como hit principal
    aparecem **sem artigo** (`a`/`an`/`the`) no Server Log — o sinal textual direto que o próprio
    M-009 já cita. A detecção é **por-mob**, não por contagem de mobs distintos na sessão: uma
    sessão pode conter vários bosses lutados em sequência (ex.: `Echo of Ichgahal` depois
    `Bakragore`) e/ou um boss com adds (ex.: `Murcion` com `an oozing corpus`), e cada boss é
    reconhecido individualmente; `context.bossMobs` pode conter mais de um nome. Critério
    conservador: uma única ocorrência com artigo exclui o mob. Consequência de S-016: contra um
    boss, a cardinalidade por leech **não pode** aceitar um bloco de área com 2 hits no mesmo
    boss (`N_leech=2` no mesmo alvo único) — cada hit no boss pertence a uma ação concreta
    distinta (AA, spell, runa ou granada), casada 1-a-1 por cast na ordem M-004. Um turno cujos
    hits atingem criaturas **distintas** (uma delas com artigo) não é boss-turn e mantém a
    topologia de área normal (AoE com 1 hit por criatura). Caso-prova: `RPBOSS` `17/Jun/2026`
    (Royal Paladin × Murcion) — `09:01:14`/`09:01:48`/`09:03:05`/`09:00:51` resolvem
    `AA + spell + granada` (1 hit cada), enquanto `08:59:25`/`08:59:28` (Murcion + `an elder
    bloodjaw`) permanecem AoE multi-criatura. Generaliza para sessões multi-boss:
    `essence`/`mazzerinbarrage` (Echo of Ichgahal + Bakragore).
- **M-010 — Cardinalidade:** dois hits no mesmo boss não podem ser atribuídos à mesma ação single-target apenas para evitar um componente não resolvido.

### Spells

- **M-011 — Cast concreto:** toda spell classificada deve estar ligada a uma incantação ofensiva concreta.
- **M-012 — Momento do impacto:** alinhar a spell pelo timestamp de seus hits, não pelo primeiro hit do turno.
- **M-013 — Janela:** procurar o cast em `[impacto-1, impacto+1]`.
  - **M-013a — A ação é escolhida sobre os hits DO COMPONENTE:** M-012 já diz que o alinhamento usa o timestamp dos hits da spell, não o primeiro hit do turno; a consequência operacional é que, depois de o resolvedor decidir o corte `AA + ação`, a ação precisa ser escolhida (ou reescolhida) sobre o **bloco final**, não sobre o turno inteiro. Com o AA ainda dentro do bloco, o primeiro `seq` é o do AA, a fronteira `Using` imediatamente anterior à runa (M-017/M-018a) fica invisível e a escolha cai no desempate por distância ao centro — que pode nomear a ação legítima do turno **seguinte** e deixar a do próprio turno sem dono (M-015/N-008). Casos-prova: `ms boss` `13/Jun/2026` `22:19:21` (a runa é a `Using` de `:21`, não a de `:23`, que é de `22:19:24`); `uhax 3 ed` `03/Jul/2026` `13:44:07` (runa de `:06`, não a de `:08`, que é de `13:44:09`).
  - **M-013b — Desempate entre partições quando a ação é posterior a TODOS os seus hits:** entre duas partições que empatam em toda a evidência determinística e de leech, vence a que não precisa de uma ação posterior a **todos** os hits que ela estaria explicando — nesse caso extremo a ação não explica hit nenhum, e a única coisa que a sustenta é a folga de relógio da janela. A comparação é contra o **último** hit do bloco, nunca o primeiro: uma spell de área atravessa segundos (`t-1`/`t`/`t+1`, M-031) e um cast em `impacto+1` para o bloco inteiro é uso **legítimo** da janela — ver `bakra` `09/Jun/2026` `09:23:20`, cujos 9 hits de `Divine Caldera` estão todos em `:20` com cast em `:21`. A granada é causal por construção (janela `[cast+2, cast+4]`, M-023) e nunca é penalizada. Caso-prova: `rpboss` `17/Jun/2026` `09:40:31` — o hit de `:32` é a granada castada em `:29` (impacto em `cast+3`, exato), não o `exori gran con` castado em `:33`, posterior ao próprio hit e pertencente ao turno `09:40:33`. **Limite conhecido:** este critério é o penúltimo desempate, depois de determinismo, leech, `timestampSplitPenalty` e rollover; ele não é evidência positiva, só recusa a folga quando há alternativa empatada que não precisa dela.
  - **M-013c — Falsificado: a folga de +1 s NÃO pode restringir a escolha da ação.** Foi testada e **rejeitada** a variante que, ao escolher a ação de um componente, restringisse os candidatos a `ts <= primeiro hit` sempre que algum existisse. Ela troca a ação certa por uma anterior e diferente: `serverlog8` `16/Jun/2026` `07:23:03` passa a ser nomeado por `exori mas res` (`:02`) em vez do `Sweeping Takedown (exori mas nia)` castado em `:04`, e `serverlog8` `07:22:57` perde o AA. A escolha da ação continua sendo por distância ao centro do bloco (M-012/M-013) com o desempate de M-014; a causalidade só atua como desempate ENTRE PARTIÇÕES (M-013b), nunca podando o conjunto de candidatos.
- **M-014 — Empate:** em igual distância, escolher o cast anterior. Vale igualmente para spell e para runa: preferir a ação posterior em empate não tem apoio em regra nenhuma.
- **M-015 — Um cast, um componente:** um cast não pode nomear dois componentes incompatíveis.
- **M-016 — Cura e suporte:** casts de cura ou suporte nunca explicam dano ofensivo.
- **M-016a — Shared Conservation e dono do log:** uma linha `You healed yourself ... (Shared Conservation)` no Server Log só aparece quando o dono daquela porção do log recebe cura por tabela como druida; para escolha do dono, a porção deve usar o Local Chat correspondente para identificar o speaker com evidência de spells de druida. Uma linha `You were healed by XXX ... (Shared Conservation)` identifica `XXX` como healer externo da tabela, não como dono do log por si só. Essa evidência continua sendo apenas identidade/suporte e nunca explica dano ofensivo (M-016).
- **M-016b — Cura de poção não é evidência de cast:** a linha `You healed yourself for N hitpoints.` também é emitida quando a cura vem de uma poção (ex.: ultimate spirit potion, que cura HP e mana no mesmo instante), não só de um cast de spell. Para escolha do dono do log, uma linha `You healed yourself` imediatamente precedida, no mesmo segundo, por `Using one of N ... potions...` é cura de poção e NÃO conta como evidência de self-heal por cast — nem no atalho determinístico de Shared Conservation, nem no scorer ordinário por coincidência de segundo. A linha continua existindo como fato observado (C-003); só a inferência de dono a ignora.
- **M-016c — Incantações `adori` ignoradas:** incantações do Local Chat cujo texto comece com o prefixo `adori` não participam da classificação nem das métricas, de forma análoga a M-021 para runas (`wall`/`bomb`/`field`). `adori` não corresponde a nenhuma spell catalogada; quando um turno tem hits cuja reversão elemental bate exatamente com uma runa ou spell determinística concorrente, uma incantação `adori` concorrente não pode nomear o componente nem vencer a partição. Caso-prova: `logs/uhax 3 server log ed.txt` / `logs/uhax 3 local chat ed.txt`, sessão `30/Jun/2026`, turno `20:51:47` — 8 hits (darklight matter, darklight source ×2, bloodjaw ×2, walking pillar ×3) revertem exatamente contra o perfil fogo de Great Fireball, confirmada por `Using one of 3558 great fireball runes...` no mesmo segundo; o Local Chat também tem `adori mas frigo` do mesmo jogador em `20:51:48`. O resultado correto é `Great Fireball` (8 hits, sem prefixo AA), não `adori mas frigo`.
- **M-016d — Spells multiestágio (mecanismo geral):** algumas spells produzem, a partir de um único cast concreto, um blast inicial de potência integral e um estágio atrasado que aterrissa depois do timestamp terminal do blast inicial. Os dois estágios pertencem à mesma ação e ao mesmo cast; o cast pode explicar no máximo um blast inicial e um estágio atrasado e não pode ser reutilizado depois de ambos serem consolidados. Cada spell multiestágio declara seus próprios parâmetros (delay(s) candidato(s) e potência(s) candidata(s) do estágio atrasado); o estágio atrasado só é confirmado por evidência mecânica suficiente (timing dentro do(s) delay(s) candidato(s), elemento/topologia compatíveis quando aplicável, e a transformação de potência declarada entre hits comparáveis do mesmo mob/estado) — nunca por mera queda de dano entre segundos adjacentes. Dano overkill truncado não prova nem contradiz sozinho essa relação. Ausência de estágio atrasado observado não autoriza criar hit ou dano virtual. Duas spells multiestágio são conhecidas atualmente: Death Echo (M-016d-1) e Spiritual Outburst (M-016e). (R-001, M-011 a M-015, D-010a, D-025/D-026, T-003/T-004, N-007/N-008)

  - **M-016d-1 — Death Echo:** `Death Echo (exevo mort ora)` de sorcerer, elemento death, área. Delay candidato: `1` OU `2` segundos após o término do blast inicial — os delays candidatos são tentados em ordem, e o motor avalia somente o primeiro segundo com pelo menos um hit não-overkill do jogador (gate guloso: não cai para o próximo delay só porque a prova falhar nesse segundo). Potência candidata única: `1/2`. O estágio atrasado é confirmado pela transformação elemental discreta e exata (reversão determinística por-mob via a tabela de mitigação/modificador death), a mesma matemática usada em D-010a — não por média de bloco, tolerância nova ou limiar arbitrário.

    - **M-016d-1c — Segundo candidato só de overkill:** o gate guloso acima procura o primeiro segundo com pelo menos um hit **não-overkill** porque overkill não é avaliável: o dano exibido é truncado e, por D-011/D-012a, não prova nem contradiz a transformação de potência. Quando **nenhum** dos delays candidatos oferece segundo avaliável e existe um segundo composto **exclusivamente** de hits de overkill, esse segundo é o estágio atrasado e é consolidado no turno do blast. Justificativa: M-016d já declara que o cast explica um blast e um estágio atrasado e **não pode ser reutilizado depois de ambos serem consolidados**; deixar o segundo só-overkill de fora não é neutro — ele vira âncora de um turno independente (T-002) e o **mesmo** cast passa a nomear componentes em dois turnos consolidados, contradizendo M-015/N-007/N-008. Entre evidência ausente (D-006) e violação certa de invariante, a evidência ausente cede. A consolidação **não afirma potência alguma**: nenhum hit do bloco recebe marcação de fração/tier, nenhum dano ou hit virtual é criado (D-006/T-003), e a exceção só vale quando o perfil declara **uma única** fração candidata — com duas ou mais haveria uma escolha real a fazer sem evidência, e o motor continua não decidindo. Caso-prova: `kim` `14/Jul/2026` `16:24:28` — blast `stalking stalk 889` em `:29` e eco `172 overkill` em `:30`, do mesmo `exevo mort ora` de `16:24:29`, resolvem como um único turno `A1 S2`; antes o `:30` era um turno próprio nomeado pelo mesmo cast. Contraprova preservada: `kim 16:22:16` e `dlc ms 21:42:51`/`21:35:29` têm segundo avaliável e continuam decididos por M-016d-1a, sem passar por aqui.

    - **M-016d-1a — Contradição × evidência ausente na confirmação do estágio:** ao testar uma fração candidata, cada hit não-overkill do segundo do eco cai em **uma** de três categorias: **casado** (existe hit comparável no blast — mesmo mob e mesmo estado de modificadores, com original elemental calculável dos dois lados — e a transformação discreta fecha); **contraditório** (existe hit comparável e ele **não** fecha); **sem contraparte** (não existe hit comparável, ou o original não é calculável de algum dos lados). A fração é rejeitada **somente** por hit contraditório. Hit **sem contraparte** é evidência ausente (D-006) e **não** rejeita a fração — a ausência de um hit comparável no blast não prova que a relação de potência falhou. A fração vence quando há **ao menos um** par casado e **nenhum** contraditório; um bloco composto só de hits sem contraparte não confirma estágio algum. Exigir que *todos* os candidatos casem trata as duas categorias como iguais e derruba a confirmação inteira por um único mob que o blast não acertou — sem a marcação de estágio, blast e eco ficam fundidos no mesmo bloco elemental e o turno morre no veto same-mob de S-004a, com o mesmo mob em dois níveis (integral e `1/2`). Casos-prova: `kim 16:22:16` — blast `undertaker 1070` em `:16` e eco `undertaker 535` em `:17` (`1/2` exato) casam, mas o `stalking stalk 449` do mesmo segundo não tem contraparte (o único outro mob do blast entrou como dodge de dano zero); `dlc ms 21:42:51` — `walking pillar 1450→725`, `darklight matter 1557→778` e `bloodjaw 1001→500` confirmam `1/2`, e o `darklight striker 781` acompanha sem contraparte. **Segundo compartilhado com outro cast concreto:** T-002 já declara que o segundo do estágio atrasado pode conter, legitimamente, hits de um cast concreto diferente. Quando existe outro cast ofensivo concreto do dono cuja janela normativa (M-012/M-013) cobre esse segundo, um hit comparável que **não** fecha sob a fração é evidência **daquele** cast e **não** rejeita a fração: a alternativa existe e está declarada. Sem outro cast assim, nada além do estágio atrasado poderia ter produzido o hit, e a contradição continua real. Nesse segundo compartilhado, a consolidação exclui do estágio atrasado **somente** os hits com evidência contrária (os comparáveis que não fecham); hits sem contraparte e overkills continuam acompanhando a explosão, como no segundo exclusivo — retirá-los também deixa pedaços do eco soltos, que viram âncora de turno órfão (medido: 3 turnos novos sem classificação). ~~Contraexemplo preservado: `dlc ms 21:35:29`, cujos dois níveis têm razão ≈`0,377` (não `1/2`), permanece não resolvido — não é par blast/eco.~~ **Corrigido:** aquela razão `0,377` não compara dois níveis da mesma explosão — compara o **eco** com o bloco de **outra spell** que caiu no mesmo segundo. O par blast/eco existe e é exato entre `:27` e `:29`: `exevo mort ora` em `21:35:27` (`source 1167`, `matter 1578`, `pillar 1468`) reverte para `O` `1079`/`1169`/`1077`, cujo `1/2` reproduz `583`/`788`/`733` nos três mobs; os `1546`/`2092`/`1947` do mesmo segundo são o `exevo gran flam hur` castado em `21:35:29`. O turno resolve como `Great Fire Wave` e o eco completo fica com o cast de origem.

    - **M-016d-1b — A via elemental pertence a quem declara confirmação elemental:** a confirmação por transformação elemental discreta SÓ se aplica a perfis cuja mecânica declarada é `confirmation: 'elemental'` (hoje, Death Echo). Spells multiestágio cuja confirmação declarada é por cluster de leech (M-016e, Spiritual Outburst) **não** podem ser confirmadas por esta via — elas permanecem para o passe de correção posterior, com o leech real já inferido. Sem essa reserva explícita, a separação depende do acaso de a reversão elemental nunca fechar (o que M-016e afirma, mas não garante hit a hit): sob o critério de M-016d-1a, um único par coincidente bastaria para a via elemental preemptar a via de leech. **A recíproca vale igual:** a via de **cluster de leech** também pertence só a quem a declara (`confirmation: 'leech_cluster'`). Um perfil de confirmação elemental cuja via falhe **não** pode ser consolidado por magnitude de cluster: o cluster de leech agrupa por razão vida/mana-por-dano, que separa mobs com e sem prey, então ele consolida **parte** do estágio atrasado e deixa o resto no turno seguinte — mesmo mob em dois níveis, morte por veto same-mob de S-004a. Caso-prova: `dlc ms 21:35:29`, em que só os dois `darklight source 583` viraram eco e os `788`/`788`/`733` ficaram para trás.

- **M-016e — Spiritual Outburst multiestágio:** `Spiritual Outburst (exori gran mas nia)` de monk é a segunda spell multiestágio conhecida. Delay candidato: `1` OU `2` segundos após o término do blast inicial — os delays candidatos são tentados em ordem, e o motor avalia somente o primeiro segundo com pelo menos um hit não-overkill do jogador (gate guloso: não cai para o próximo delay só porque a prova falhar nesse segundo). Potência candidata: uma dentre três tiers — Stage 1 `3/8`, Stage 2 `1/2`, Stage 3 `5/8` — inferida somente pela transformação discreta de dano observada, sem sinal externo (não há combo counter nem outro sinal de log disponível); todo o bloco do estágio atrasado precisa fechar sob a MESMA fração, sem mistura de tiers no mesmo estágio.

  O dano de Spiritual Outburst depende da arma do jogador e pode ter componente físico misturado ao elemental — não é uma reversão elemental pura e determinística como Death Echo, e a reversão via D-010a não fecha de forma confiável para esta spell (confirmado empiricamente: mesmo o par limpo `monk2 07:19:35`→`:36` só fecha 1 de 5 hits sob reversão holy pura). Por isso a confirmação do estágio atrasado usa evidência independente do elemento/arma: um cluster interno consistente de razão vida-por-dano e mana-por-dano (mesmo princípio de D-019/S-014, aplicado ao invés da reversão elemental), com pelo menos 2 hits comparáveis, cuja magnitude bruta média se aproxima (tolerância `20%`) de uma das três frações candidatas contra a magnitude bruta média do blast inicial. Essa prova por leech é necessária porque o candidato ao estágio atrasado pode compartilhar o segundo com um cast concreto diferente e real (ex.: Greater Flurry of Blows) — a prova precisa separar as duas coisas sem depender de elemento/arma.

  Como a prova por reversão elemental (D-010a) nunca fecha para esta spell, e o setup de leech real só é conhecido depois da 1ª passada de classificação (bootstrap sem leech), a consolidação do estágio atrasado de Spiritual Outburst acontece numa passada de correção após o leech real ser inferido: a 1ª passada (`buildTurns`) tenta a via elemental genérica de M-016d e legitimamente não encontra nada; a 2ª passada, com leech setup real disponível, aplica a prova por cluster de leech descrita acima e move os hits do estágio atrasado para o turno de origem quando confirmados. Nenhum hit muda de estágio ou de turno sem essa prova.

  **Risco residual documentado:** os tiers Stage 1 (`3/8`) e Stage 2 (`1/2`) não têm evidência de log real nesta mudança — os dois casos-prova disponíveis (`monk2 07:19:35` e `07:19:56`/`07:19:58`) resolvem em Stage 3 (`5/8`). A cobertura de Stage 1/2 é só sintética/unitária. Se um log real com esses tiers aparecer no futuro, adicionar como novo caso-prova.

  Casos-prova: `logs/monk 2 server log.txt` / `logs/monk 2 local chat.txt` (sem cabeçalho de sessão/data).
  - `07:19:35`: cast `exori gran mas nia` em `:35`; blast inicial em `:35` (5 hits, ~1400–1620) e estágio atrasado em `:36` (5 hits, ~850–950, Stage 3) — os dois estágios caem no MESMO turno mecânico (delay=1), sem precisar mover hits entre turnos. `A1 + Spiritual Outburst`, 10 hits no componente spell.
  - `07:19:56`/`07:19:58`: cast `exori gran mas nia` em `:56`; blast inicial em `:56` (8 hits). O segundo `:57` não tem nenhum hit do jogador (delay=1 sem candidatos), então o único delay avaliado é `:58` (delay=2). Em `:58`, o bloco de 9 candidatos não-overkill mistura o estágio atrasado (`906`, `907`, `907`, razão vida/dano uniforme `~0.208`) com um cast concreto e real de `exori gran mas pug` (Greater Flurry of Blows): o AA do turno `:58` (`781`, razão `~0.521`, claramente distinta) e os crits reais de Flurry of Blows (`1432`/`1448`/`1444`/`1555`/`1516` + `145` overkill, razão `~0.137`). O estágio atrasado (`906`/`907`/`907`) é consolidado de volta ao turno de origem `:56` (11 hits no componente spell); o turno `07:19:58` continua existindo como ciclo independente com seu próprio AA (`781`) e o `Greater Flurry of Blows` real (6 hits) — o estágio atrasado órfão NÃO ancora nem desloca esse turno seguinte (T-002).

  - **M-016e-gate — Isenção do veto same-mob para estágio ainda não atribuído:** a
    estratificação por estágio que o gate de exatidão same-mob (S-004a) usa só funciona
    depois que o rótulo de estágio foi atribuído ao hit. Para Spiritual Outburst, cuja
    confirmação é por cluster de leech numa passada de correção **posterior**, os hits
    ainda não têm rótulo de estágio no ponto em que a validação de partição roda: blast e
    eco do mesmo mob colidem e o gate os veria como contradição. Por isso, o veto duro
    `same_mob_state_exact_original_mismatch` **não se aplica** a uma ação que declara
    mecânica de múltiplos níveis por-mob cujos rótulos ainda não foram atribuídos —
    condicionado ao mecanismo **declarado** no perfil da ação (`multiStage.confirmation !==
    'elemental'`), nunca a uma spell/log/turno específico. Death Echo
    (`confirmation: 'elemental'`) NÃO é isento: seus estágios já estão atribuídos nesse
    ponto e a estratificação funciona. Esta isenção significa apenas **ausência de
    evidência negativa** (D-006), não aprovação: o bloco continua sujeito a leech,
    crit-homogeneidade, M-024/M-025 e demais validações. Uma mecânica que produz níveis
    distintos no mesmo mob **sem** estar declarada em `docs/CLASSIFICATION_RULES.md`
    permanece vetada — a isenção é por regra declarada, não por analogia. (Esta família de
    isenção por mecânica declarada é a mesma de M-035 para beams e M-037 para o decay de
    Chained Penance.)

- **M-034 — Tiers de bônus do Executioner's Throw:** `Executioner's Throw (exori amp kor)` de knight (físico, área) tem um bônus de dano condicional por vida do alvo (execute): binário por-hit (um hit tem ou não o bônus) e um multiplicador **fixo por log** (a mastery do personagem), um dentre `2.0`/`2.25`/`2.5` (`+100/+125/+150%`; "bônus 100%" dobra o dano em relação ao hit sem bônus do mesmo alvo). Esta regra apenas **rotula por tier** os hits de um componente `Executioner's Throw` já isolado pela classificação de turno — ela roda como pós-passe de sessão, NÃO participa da pontuação/seleção de partição e NÃO reatribui hits (a segmentação e a cardinalidade por leech continuam por M-031/M-032 e casos 9b/9c). Do resultado, cada hit ganha `executionerBonusActive` e a linha de rotação ganha sub-linhas `base`/`amped` (mesmo encanamento do bônus condicional do Terra Burst).

  A decisão de tier é **leech-primário, por-canal, por-turno** — não por reversão física: um EK pode empunhar arma com 0% de ataque físico, o que torna a reversão física (armor + arma) não confiável, e além disso a maioria dos hits de amp kor é overkill (dano exibido truncado e inútil). O leech incide sobre o dano **real** (pré-truncamento) e é bimodal na razão `A` do bônus. Os canais são avaliados **separadamente**, com **mana leech como canal primário** (o life leech é capado pela vida faltante e subestima quando o jogador está quase cheio). A clusterização é **por turno** porque o valor de leech carrega o fator de área (`0.1 + 0.9/N`, D-023) que desliza entre casts de tamanhos diferentes; dentro de um mesmo cast o fator de área é constante e o gap `~A×` sai limpo. Como o multiplicador é fixo por log, um pass de sessão calibra os níveis de mana com os hits já confiantes e classifica os hits de casts de tier único (sem gap interno) por proximidade, deixando `null` (agrupado em `base`, conservador) apenas a zona ambígua e os hits sem leech nenhum. O multiplicador `A` exibido vem da razão de dano dos hits **limpos** (não-overkill) — um dano overkill é piso, não o valor real, então `2243/1115 ≈ 2.01` NÃO pina `A`; a razão de leech também não pina (carrega ruído de área/arredondamento), só classifica.

  Caso-prova: `logs/bastion server log ek.txt` / `logs/bastion local chat ek.txt` (`Sat Jun 13 2026`, personagem com bônus `+125%` ⇒ `A = 2.25`), turno `15:21:16` — componente `Executioner's Throw` de 4 hits raubritter: `1115` (life `184`, mana `65`) = base; `2243` (life `420`, mana `146`), `668 OK` (life `423`, mana `147`) e `340 OK` (life `431`, mana `128`, leech > dano exibido) = amped ⇒ **3 amped + 1 base**. O `A` inferido pelo dano limpo bate com a mastery real (`2.25`), sem hardcode. Fixtures sem `exori amp kor` permanecem idênticos (o pós-passe encontra o conjunto vazio e retorna sem mutar nada).

- **M-035 — Sub-linhas central/side de beams de sorcerer:** os beams `Energy Beam (exevo vis lux)`, `Great Energy Beam (exevo gran vis lux)` e `Great Death Beam (exevo max mort)` viram reta de 3 com a mastery de beam (1 central + 2 laterais); os laterais causam uma fração base `F = 0,70` do dano do beam central. O bônus de dano da Beam Mastery por alvo atingido é aplicado **por sub-linha** (`central` e `side` contam seus próprios alvos, com cap de 3 alvos), então a fração observada no log pode ser `0,70 × bonus_side / bonus_central`, usando o tier de mastery do personagem (`+10%`/`+12%`/`+14%` por alvo). O leech também é cardinal por sub-linha: um segmento central de 1 hit pode fechar `N_leech=1` sem ser AA. Esta regra rotula por tier (`central`/`side`) os hits de um componente de beam; para classificação de turno, um beam validado por esses subníveis continua sendo **uma única spell concreta**, e a cardinalidade de leech de uma sub-linha não é evidência positiva de AA por si só. Cada hit ganha `beamSide` e a linha de rotação ganha sub-linhas `central`/`side` (mesmo encanamento do Terra Burst).

- **M-035a — A isenção de beam vale só dentro da fração declarada:** por M-035, dois níveis no mesmo mob e mesmo estado são mecânica declarada, e por isso não disparam o veto de exatidão same-mob (S-004a) nem podem virar evidência positiva de AA (H-005c). Essa isenção termina onde a mecânica termina: a fração observada vive em `0,70 × bonus_side / bonus_central`, cujo extremo inferior é o lateral sem bônus contra o central saturado em 3 alvos — `0,70 / (1 + 0,14 × 3) ≈ 0,493`. Uma razão same-mob **abaixo** desse mínimo não é sub-linha nenhuma: nenhum tier de mastery a produz, e tratá-la como mecânica declarada apaga evidência real de fronteira. O limite é **derivado** das constantes já declaradas nesta regra, não um limiar novo. Caso-prova: `Mrowdy 2`/`ms boss` `17:16:37` — `roaming dread` com `112` e `2448` no mesmo estado (razão `0,046`, enquanto a sub-linha exigiria ≈`1714`); o `112` é o AA de varinha, confirmado pela distribuição de AA da própria sessão nesse mob (mediana `124` em `1020` hits), e o turno é `A1 + Great Energy Beam`. Contra-exemplo que permanece isento: `kim` `16:13:26`, `stalking stalk` `1155/1650 = 0,700` exato.

  Beam é 100% elemental determinístico, mas o **elemento efetivo depende da postura/stance** do sorcerer (energy pode virar death/fire), então o elemento não é assumido do perfil: o motor reverte cada hit por-mob testando `{death, energy, fire}` (D-010a) e escolhe o elemento de menor spread intra-nível somado sobre os casts (perfil como desempate quando houver empate real). A reversão por-mob normaliza mitigação/modificador, então o split funciona com mobs de espécies diferentes no mesmo cast e cada cast é auto-suficiente. No espaço revertido, o nível alto = central e o baixo = side; cada cast é validado contra os pares finitos `0,70 × bonus_side / bonus_central`, onde `bonus_*` vem da contagem de hits daquela sub-linha sob um dos tiers oficiais da mastery. Um hit que não bate em nenhum dos dois (contaminação por outra spell no mesmo canal elemental — ex.: `exevo mort ora`/Death Echo no canal death — ou dano de overkill truncado) fica sem tier (`null`, agrupado em `central` na exibição, conservador), nunca forçado num tier com `F` errado. Death Echo (`exevo mort ora`) e Energy Wave (`exevo vis hur`) NÃO são reclassificados como beam.

  Casos-prova: `logs/death echo server log.txt` / `logs/death echo local chat.txt` (`Fri Jul 10 2026`, sorcerer solo `Very Pog`, pós-cutoff), turno `11:06:22` — componente `Great Death Beam` (elemento resolvido `death`, `F = 0.70`): revertidos `cyclursus 1700`/`roaming dread 1805` → central (nível ~1600); `cyclursus 1189`/`roaming dread 1263 ×4` → side (nível ~1120 = `1600 × 0.70`); `504 OK` (overkill) → `null`. `logs/dlc ms Server Log.txt` / `logs/dlc ms Local Chat.txt` (`Fri Jul 17 2026`, pós-cutoff), Great Death Beam com elemento efetivo `fire`: `21:36:49` fecha `side/central ≈ 0,7769`, explicado por `0,70 × 1,42 / 1,28` (side com ≥3 alvos, central com 2); `21:44:27` fecha `≈ 0,8721`, explicado por `0,70 × 1,42 / 1,14` (side com ≥3, central com 1); `21:41:16` fecha `≈ 0,5620`, explicado por `0,70 × 1,14 / 1,42` (side com 1, central com ≥3). Esses hits são spell de beam, não AA. `Energy Beam`/`Great Energy Beam` (energy) ficam validados só transitivamente por falta de fixture solo pós-cutoff limpa de energy beam (risco documentado, precedente do risco Stage 1/2 de M-016e). Fixtures sem ação de beam permanecem idênticos (o detector encontra o conjunto vazio e retorna sem mutar nada).

- **M-036 — Bônus de dano do player contra classe de bestiário:** um reward de bestiário
  (ex. "Improved" de Charm Points) dá ao personagem `+N%` de dano contra TODOS os mobs de
  uma classe de bestiário inteira (`bestiaryClass` em `js/mob-element-mods-post-2026-06-16.js`,
  mesclado do `bestiary.json` oficial). É fato do **personagem**, não do mob nem do
  elemento — entra como multiplicador pós-mitigação uniforme (`bestiaryClassMultiplierForHit`
  em `js/unified-formulas.js`, mesmo ponto de prey/utevo grav san em `postMultiplier`),
  afetando igualmente a reversão física (AA) e elemental (spell/runa/granada) contra mobs
  da classe detectada.

  Detectado por sessão (`inferBestiaryClassDamageBonus`, `js/unified-classification-engine.js`)
  usando o dano de charm ofensivo como testemunha: é FIXO por mob (sem sorteio), então
  `hitpoints × 0.05 × mitigação × effectiveMod(modElemento, pierce)` prevê o valor exato
  quando não há bônus. `pierce` usa a mesma fórmula do dano normal do player
  (`pierceForElement`/`effectiveMod`) e precisa somar **todas** as fontes observadas na
  própria linha do charm: `+0.08` de "increased damage by Expose Weakness", `+0.16` de
  "active elemental amplification" (D-010c), mais qualquer pierce já inferido pra sessão
  (`context.bmPierce`, holy/physical). **Reconstruir a testemunha com um hit sintético que
  omita uma dessas fontes é erro**: a fonte omitida vira resíduo sistemático em
  `observado/esperado` e é lida como bônus de classe. Pelo mesmo motivo, as testemunhas
  são agrupadas por `(mob, elemento, estado de pierce)` — linhas com e sem amplification
  nunca compartilham mediana. Caso-prova do erro: `uhax 3` S1, `darklight matter`,
  `enflame charm`; o log traz as quatro variantes e cada uma bate a sua conta
  (`1785` sem EW e sem amp, `1900` sem EW e com amp, `1842` com EW e sem amp, `1957` com
  EW e com amp). Com 251 linhas amplificadas contra 20 não amplificadas, a mediana caía na
  população amplificada e era comparada ao esperado da outra; a razão `1,33/1,25` era
  arredondada para um "bônus de 6% da classe `slime`" inexistente, que virava
  `postMultiplier` e derrubava o original da runa de `751` para `709`.

  Procs dentro de uma janela de utevo grav san são excluídos (grav san
  também infla dano de charm, M-016/`inferGravSanSetup`). "due to active charm upgrade" no
  sufixo NÃO afeta dano (é só chance de ativação do charm) e é ignorado. Vota por CLASSE
  (não por mob) entre `BESTIARY_CLASS_DAMAGE_BONUS_CANDIDATES`, exigindo unanimidade entre
  todas as linhas testemunhas da classe — sem isso, ela fica sem bônus em vez de arriscar
  um valor por maioria.

  **Testemunha única é aceita.** Exigir mobs distintos foi implementado, medido e
  revertido: em `ingol ed` S0 a classe `bird` tem `harpy` como única testemunha e o bônus
  de 5% dali é real — com ele os 251 turnos fecham com zero violação de invariante, sem
  ele aparecem 166 violações `S-004/H-001/H-002`. A cardinalidade de testemunhas não
  distingue bônus real de artefato; o que distingue é o efeito sobre a coerência da
  reversão — bônus real fecha os blocos determinísticos, artefato os quebra.

  **Limitação conhecida e não trabalhada: a grade não tem hipótese nula.**
  `BESTIARY_CLASS_DAMAGE_BONUS_CANDIDATES` começa em `0,02`; não existe candidato `0`.
  Quando a única testemunha de uma classe fica dentro da tolerância dos dois lados, o
  detector é obrigado a escolher o menor candidato da grade em vez de concluir "sem
  bônus". Caso medido: `monk` S0, classe `extra dimensional`, uma linha só
  (`mitmah scout`, energy, n=4), observado `202` contra `200,19` sem bônus e `204,19` com
  `2%` — o desvio de `+0,9%` está mais perto do zero (erro `1,81`) do que do `2%`
  (erro `2,19`), e a tolerância `max(2; esperado×1,25%)≈2,5` aceita os dois. O `2%`
  inferido ali é artefato da grade. Contraste na mesma família: `monk 2` S0, classe
  `human`, três mobs e três elementos concordando em `+1,2%` a `+1,5%`
  (`chastener` earth `547`, `skirmisher` fire `617`, `marksman` physical `595`), em que a
  hipótese sem bônus seria rejeitada em duas das três linhas.

  Impacto medido: **nenhum turno** de `monk` ou `monk 2` depende desse bônus — com e sem
  ele os dois logs dão 10 violações de invariante e zero turno com diagnóstico diferente.
  O efeito fica restrito ao dano base revertido (~2%). Por isso a decisão é registrar a
  limitação, não corrigir a grade agora.

  Caso-prova (bônus real): `logs/ingol ed Server Log.txt` / `logs/ingol ed Local Chat.txt`
  (`Fri Jul 17 2026`, druid, sem utevo grav san — a spell é exclusiva de paladin) — harpy
  (`bestiaryClass: Bird`) diverge consistentemente `×1.05` do original de gelo revertido
  em 143 componentes da sessão (crape man/rhindeer, não-aves, batem exatos); confirmado
  pelo `freeze charm` da harpy: observado `431` vs esperado `411.05`
  (`7700 × 0.05 × 0.970596 × 1.10`), razão `1.0485`. Sem o multiplicador de classe, os 11
  turnos de `Ice Burst (exevo ulus frigo)` falhavam `validateTerraBurstBonusBlock`
  (`terra_burst_bonus_cluster_span_too_wide`) e a UI não mostrava sub-linhas
  base/bônus — com a classe `Bird = 0.05` aplicada, 10/11 turnos fecham o cluster no
  nível correto `1.4`.

  Caso-prova negativo (falso positivo evitado): `logs/mazzerinbarrage server log.txt`
  sessão salva `Sun Jun 28 23:02:16 2026` (paladin, `utevo grav san` ativo, `gravSanSetup.bonus
  = 0.12`, `bmPierce = 0.04` holy/physical) — sem descontar grav san/EW/bmPierce, 4 classes
  divergiam `~3–12%` da fórmula bruta (falso positivo "Construct +3%" via `walking pillar`);
  com os 3 descontos, as 8 combinações mob×EW fecham em razão `0.9995–1.0003`, nenhuma
  classe é confirmada (correto — este log não tem o reward). Fixtures sem charm elemental
  fora de janela de grav san permanecem idênticos (o detector retorna `bonus: 0` e o
  pós-passe é inerte).

- **M-037 — Decay de cadeia de Chained Penance (mecânica declarada, não reconstruída):**
  `Chained Penance (exori med pug)` de monk (holy, área) encadeia entre alvos e **perde
  uma fração fixa de dano a cada pulo da cadeia** — o dano cai monotonicamente ao longo
  da ordem de encadeamento, e o mesmo mob pode aparecer em posições diferentes de cadeia
  dentro do MESMO cast, com danos distintos. Consequência normativa: dois hits de um
  bloco de Chained Penance no mesmo mob e no mesmo estado de modificadores **podem
  legitimamente ter originais distintos**, e essa divergência **não é contradição**
  (D-006) — é o fenômeno que esta regra declara.

  Esta regra **declara** a mecânica; ela **não** especifica reversão. O classificador
  **não** infere, reconstrói nem compensa o fator de decay, exatamente como faz com os
  sub-tiers central/side de beam (M-035) enquanto o detector correspondente não existir.
  A fração observada nos fixtures é de aproximadamente `5%` por pulo, mas o valor **não
  é normativo** aqui: como nada é revertido a partir dele, cravar a constante gravaria na
  fonte da verdade um número medido num único personagem/log.

  **Limitação conhecida e aceita:** sem a reversão, o dano base agregado (A-006) da linha
  de rotação de Chained Penance é a média de hits em posições de cadeia diferentes, logo
  fica **enviesado para baixo** e não representa nenhum hit individual. A classificação
  em si permanece correta, porque o corte AA × spell nas vocações de AA single-target é
  decidido por posição do primeiro hit e cardinalidade de leech (V-011/V-013), que não
  dependem do decay. Modelar a reversão é melhoria de métrica, não pré-requisito de
  classificação.

  Evidência observada (`logs/monk server log.txt`, mesmo mob e mesmo estado dentro de um
  cast): razões de dano entre hits consecutivos da cadeia `0,9474 / 0,9481 / 0,9488 /
  0,9490 / 0,9493 / 0,9495 / 0,9503` (um pulo) e `0,9006 / 0,9003` (dois pulos, ≈ o
  quadrado do fator de um pulo). Casos-prova: `logs/serverlog6..9.txt`,
  `logs/monk server log.txt` e `logs/monk 2 server log.txt`.

### Runas

- **M-017 — Sinal de execução:** `Using one of N … runes` é sinal **primário** de classificação, no mesmo nível da mudança de crit-state (D-007). Comprova a execução da runa; não inventa dano onde não existe bloco determinístico compatível.
- **M-018 — Dano confirmado:** uma runa só recebe dano quando existe componente compatível em elemento, topologia, cardinalidade, ordem e timing.
- **M-018a — Precedência do `Using`:** quando uma execução de runa está confirmada por `Using` e existe um run contíguo de hits deterministicamente consistente com o elemento e a topologia dessa runa, esse run é classificado como runa, **com precedência sobre a leitura física coincidente** (D-005/V-002) — ainda que o original físico de algum desses hits caia dentro do intervalo do AA. Onde os hits forem fisicamente variáveis e não formarem bloco elemental compatível, o `Using` permanece apenas execução/uptime (A-004) e os hits seguem AA. Como `Using` é sinal primário, uma linha de runa observada dentro do turno também deve gerar a fronteira candidata imediatamente anterior à runa antes de podas por leech, desde que existam hits antes e depois dela no turno. Para essa fronteira, um charm-kill real seguido de XP e reconhecido por S-014e conta como hit virtual na posição original do evento: se ocorrer antes do `Using`, pode ocupar o único AA single-target; se ocorrer depois, pertence ao run compatível da runa. Esta precedência não conta repetições nem usa limiar numérico: o critério é a consistência determinística do original elemental e a ordem observada, não a quantidade de hits.
- **M-019 — Conflito com spell:** spell e runa não podem coexistir no mesmo turno. Quando uma spell ofensiva estiver confirmada, `Using` não pode retirar hits dela.
- **M-020 — Tentativa sem dano:** runa usada sem componente compatível deve ser registrada como tentativa sem dano.
- **M-021 — Runas ignoradas:** nomes contendo `wall`, `bomb` ou `field` não participam da classificação nem das métricas.
- **M-022 — Runa desconhecida:** runa sem perfil fica como `unknown_rune_topology` e não classifica dano.

| Runa | Topologia | Elemento |
|---|---|---|
| Sudden Death | single-target | death |
| Icicle | single-target | ice |
| Holy Missile | single-target | holy |
| Stone Shower | área | earth |
| Thunderstorm | área | energy |
| Great Fireball | área | fire |
| Avalanche | área | ice |
| Explosion | área | physical |

### Divine Grenade

- **M-023 — Janela de explosão:** a granada explode entre cast+2 e cast+4.
- **M-024 — Um impacto:** uma granada possui exatamente um **evento mecânico de impacto**. O evento pode ser observado em um timestamp ou em exatamente dois timestamps cronologicamente consecutivos quando o bloco combinado permanece dentro da janela M-023 e passa cumulativamente por contiguidade, homogeneidade determinística, crit-state, distinção do spell adjacente por M-031 e **cardinalidade de leech utilizável**. Para a forma excepcional de dois timestamps, ausência de setup/canal de leech utilizável é ausência de prova do rollover, não aprovação por falta de contradição; o turno pode continuar `unresolved` se nenhuma outra partição fechar. O caso de um timestamp permanece a forma-base: entre hipóteses cumulativamente válidas, a permissão de rollover não pode apagar uma fronteira spell→granada já sustentada por casts concretos e timestamps distintos apenas para reduzir a quantidade de componentes; a hipótese sem rollover prevalece antes dos desempates fracos de alinhamento e redundância. Mais de dois timestamps, uma lacuna temporal ou quebra de contiguidade são contradição e não provam o impacto. Caso-prova adicional do alcance geral da regra: `thunder arrow 18:55:49` (sessão `21/Jul/2026`) resolve `A7 + Divine Caldera 15 + Divine Grenade 13`, com o evento de granada observado em `:50/:51` e comprovado cumulativamente por leech. Contraguarda: `bakra 09:21:00` (sessão `09/Jun/2026`) permanece `unresolved`; sem setup de leech utilizável e com cast concreto de Divine Caldera em `:59`, o log não prova que os dois hits de `:00` e os dois de `:01` sejam uma única granada.
- **M-025 — Uma atribuição:** o mesmo cast não pode explicar hits em dois componentes ou turnos consolidados. Em particular, **cross-turno**: a janela de explosão `[cast+2, cast+4]` pode cruzar a fronteira provisória entre dois turnos (turnos de 2s); quando exatamente um prefixo contíguo do turno seguinte faz o bloco combinado satisfazer M-024 e a remoção desse mesmo prefixo faz o turno seguinte resolver sem reutilizar o cast, o prefixo pertence ao evento do turno originário. Fora dessa prova cumulativa, um cast cuja explosão já foi consolidada num turno **não** pode semear um componente de granada noutro turno da mesma janela. Todos os hits permanecem preservados por T-003/T-004. Caso-prova: `barrage` cast `exevo tempo mas san` `19:00:05` explode inteiro em `19:00:07` (6 hits, um timestamp de impacto); `19:00:09` (`c+4`) é `A4 S5` (Ethereal Barrage), sem granada fantasma de 1 hit e sem hit virtual por charm.
- **M-026 — Boss:** contra boss único, uma granada produz no máximo um hit.
- **M-027 — Cast sem dano:** uma granada lançada pode não causar dano; isso não autoriza inventar hits.
- **M-028 — Chat prioritário:** marcas heurísticas só são válidas quando compatíveis com um cast real.
- **M-029 — Turno do cast:** um turno all-arrow no instante do cast pode ser AA válido; a explosão pertence ao impacto posterior.
- **M-030 — Bloco contíguo:** granada não pode ser um hit isolado inventado no meio de um bloco coerente de AA.
- **M-031 — Granada distinta do spell (mesmo original = mesmo componente):** um bloco de granada só é válido se seu **dano original holy** for **distinto** do bloco de spell adjacente do mesmo turno. Hits que compartilham o dano original do spell **pertencem ao spell**, mesmo que caiam em outro timestamp — uma spell de área pode atravessar segundos (`t-1`/`t`/`t+1`). O classificador **não** pode fatiar uma spell que atravessa timestamp em `spell + granada` só porque há um cast de granada na janela; a granada só reivindica hits no **nível de original da granada**, distinto do spell. Caso-prova: `mk 05:42:01` — o "bloco de granada" (O_holy 1390) tem o mesmo original da Divine Caldera (O_holy 1390) e é o mesmo Caldera atravessando `:01→:02`; a granada real está em `05:42:03` (O_holy ≈ 861). Rotular os hits de 1390 como granada cria 2 timestamps de impacto no cast (viola M-024).
  - **Override 1 — cast+timestamp distintos:** o veto é liberado quando `spell.action.ts !== grenade.action.ts` (dois casts concretos e diferentes, já resolvidos por `chooseActionForComponent`) **e** nenhum hit do bloco `spell` compartilha `ts` com nenhum hit do bloco `grenade`. Sem travessia de segundo entre os blocos, não há o que M-031 foi desenhado para proteger — a sobreposição no original revertido (dentro da tolerância `±2` de `intersectSets`, calibrada para ruído de arredondamento entre mobs/mitigação, não para distinguir duas ações de potência parecida) deixa de ser motivo de rejeição. Caso-prova: `barrage 19:02:09` (sessão `16/Jun/2026`) — Divine Caldera (cast `exevo mas san` `19:02:09`, 11 hits, todos em `:09`) e Divine Grenade (cast `exevo tempo mas san` `19:02:07`, janela `[19:02:09,19:02:11]`, 9 hits, todos em `:10`) têm originais holy [771,772] e [772,773] (overlap só em 772, dentro da tolerância), mas os casts e os timestamps dos hits são inteiramente distintos entre os dois blocos → M-031 não veta, turno resolve como `AA 7 / Divine Caldera 11 / Divine Grenade 9`.
  - **Override 2 — dano final por mob+estado, só quando o Override 1 não se aplica (blocos compartilham `ts`):** agrupar hits não-overkill de cada bloco pela mesma chave de `same_mob_state_exact_original_mismatch` (`normalizeName(mob) + EW + prey + amplification + tipo + crit + Low Blow + Onslaught`). Sem nenhuma chave presente nos dois blocos, não há dado para comparar e o veto permanece (fail-safe). Com pelo menos uma chave compartilhada, o veto só é liberado se **todas** as chaves compartilhadas tiverem dano final diferente entre `spell` e `grenade` — uma única coincidência exata é evidência de que é o mesmo evento (o mesmo princípio que protege `mk 05:42:01`) e mantém o veto, mesmo que outras chaves divirjam. **Sem caso-prova isolado no corpus atual** — nos turnos "mesmo segundo" ainda não resolvidos por esta via (`darklight e vemiath 22:22:18`; `jaded 20:05:17`, `20:58:56`, `20:59:54`) M-031 nunca é a única violação (concorre com `physical_intersection_empty`, `elemental_cluster_span_too_wide` ou `leech_cardinality_failed`), então este override é defensivo/estrutural, não uma correção comprovada para esses 4 turnos hoje. `jaded 21:01:52` deixou de integrar essa lista porque M-024 agora reconhece cumulativamente o bloco de granada em `:52/:53`; ele não depende deste override isoladamente.

### Cardinalidade por vocação e por turno

- **M-031 — Topologia do AA por vocação:** knight, druid, sorcerer e monk possuem auto ataque exclusivamente single-target. Royal Paladin (RP) é a única vocação cujo auto ataque pode ser de área ou single-target.
- **M-032 — Cardinalidade de AA por turno:** para knight, druid, sorcerer e monk, um turno válido deve conter zero ou um hit classificado como AA. Dois ou mais hits classificados como AA no mesmo turno são inválidos para essas vocações. Para RP, permanece válida uma única instância de AA por ciclo, que pode produzir um hit quando single-target ou vários hits quando for de área.
- **M-033 — Runa single-target por turno:** Sudden Death e qualquer outra runa single-target podem receber no máximo um hit classificado por turno, de modo equivalente às spells single-stage das vocações. Um turno com dois ou mais hits atribuídos a runa single-target é uma classificação inválida, ainda que existam múltiplas linhas `Using`.

## 3. Dano e sinais auxiliares

### Glossário de leech

- **Hit principal elegível:** linha ofensiva real do jogador que pode pertencer a AA, spell, runa ou granada. Não inclui `damage reflection`, `wound charm`, `overpower charm` ou outros procs anexos.
- **Dodge de Hazard:** linha `dodged your attack. (Hazard)` é tentativa ofensiva observada do jogador e conta como hit principal elegível de dano `0` para cardinalidade/`N_leech`; ela não possui leech, não prova dano original e não inventa dano virtual.
- **N_leech:** quantidade de hits principais elegíveis produzidos pelo mesmo componente. `N_leech` **não** significa quantidade de mobs distintos, quantidade de nomes únicos de mob, quantidade de criaturas diferentes, nem quantidade de alvos únicos.
- **Mesmo mob repetido:** se um componente produz duas ou mais linhas de dano no mesmo mob, cada linha principal incrementa `N_leech`. Exemplo: dois hits principais no mesmo `night harpy` dentro do mesmo componente significam `N_leech = 2`.
- **Mob alvo:** é contexto do hit e pode afetar resistência/modificadores e bônus de minor charm, mas não reduz `N_leech`. O nome do mob não deve ser usado para transformar `N_leech` em contagem de mobs distintos.

- **D-001 — Dano efetivo:** dano bruto exibido no Server Log.
- **D-002 — Dano original:** conjunto de valores que poderia gerar o dano observado após resistências, armadura, mitigação, crit, prey e demais modificadores.
- **D-003 — Elemental:** representar dano elemental determinístico por um conjunto discreto de originais possíveis.
- **D-004 — Físico:** representar dano físico por intervalo de originais possíveis devido ao roll de armadura.
- **D-005 — Comparabilidade:** dois hits só são incompatíveis quando ambos possuem evidência calculável para o mesmo tipo de dano.
- **D-006 — Evidência ausente:** mob sem modificadores conhecidos gera evidência desconhecida, não contradição.
- **D-007 — Crit-state:** hits críticos e não críticos não pertencem ao mesmo bloco determinístico quando a normalização não explicar a diferença. O crit-state de bloco é o estado crítico observado da ação/componente; efeitos de charm que disparam **por mob/hit** não transformam sozinhos o restante do componente em contradição. Um Low Blow em um mob não torna hits não-Low-Blow de outros mobs incompatíveis por `mixed_crit_state` apenas por não terem o charm.
- **D-008 — Low Blow:** Low Blow é fonte de crítico **por mob/hit**: a linha afetada deve permanecer marcada como crítica e como Low Blow, mas Low Blow adiciona chance de crítico, não um multiplicador próprio de dano. Portanto ele deve ser separado de crítico normal nas chaves de estado determinístico e na apresentação, sem ser tratado como crit-state global do componente.
- **D-008a — Savage Blow:** Savage Blow é diferente de Low Blow. Ele aparece em linha de `critical attack` e representa aumento de dano crítico **por mob/hit**; deve permanecer marcado como `savageBlow`, nunca como `lowBlow`. Enquanto não houver normalização canônica do bônus de Savage Blow, hits com e sem Savage Blow pertencem a estados determinísticos distintos para comparações same-mob/same-estado e buckets de inferência de crítico.
- **D-009 — Onslaught:** manter Onslaught separado de crítico real.
- **D-009a — Reversão de Onslaught:** Onslaught adiciona `+60%` fixo ao dano, ADITIVO com o multiplicador de crítico (não multiplicativo, mesmo modelo do bônus de Transcendence). Ao reconstruir originais físicos ou elementais (D-010a a D-010c) de qualquer hit marcado com Onslaught, em qualquer componente (AA, spell, runa, granada) e qualquer vocação, o classificador deve desfazer esse bônus no mesmo passo em que desfaz o crítico: hit com Onslaught e sem crítico real usa fator `1,6`; hit com Onslaught e crítico real usa `multiplicadorDeCrítico + 0,6`. Omitir essa reversão infla o dano em até 60% antes da comparação de originais, o que pode esvaziar interseções físicas (S-004/S-007) que seriam válidas e vetar partições corretas indicadas pela fronteira de crit-state (D-007/S-008).
- **D-010 — Modificadores:** reverter Expose Weakness, prey e demais modificadores antes de comparar originais.

- **D-010a — Pipeline discreto de dano elemental:** para reconstruir originais elementais a partir do dano observado, o classificador deve usar a ordem discreta abaixo. É proibido reconstruir original elemental por divisão simples, porque `CEIL`, `FLOOR`, mitigation, prey e demais multiplicadores podem alterar o conjunto de originais possíveis em 1 ou mais pontos. Hits marcados com `perfect shot` exigem, além desta cadeia, a reversão de **D-010f**.

```text
F = dano final exibido no Server Log
O = dano original antes da resistência elemental
m = elementModEfetivo, já incorporando pierce, Expose Weakness e demais alterações de resistência conhecidas
M = mitigationMultiplier = 1 - mitigation / 100
P = postMitigationMultiplier = prey e demais multiplicadores pós-mitigação conhecidos; se ausente, P = 1

E = CEIL(O × m)
A = FLOOR(E × M)
F = FLOOR(A × P)
```

A inversão deve ser feita por intervalos discretos:

```text
invFloor(y, q) = [CEIL(y / q), CEIL((y + 1) / q) - 1]
invCeil(y, q)  = [FLOOR((y - 1) / q) + 1, FLOOR(y / q)]
```

Para dano elemental puro:

```text
A_candidates = invFloor(F, P)
E_candidates = união de invFloor(A, M) para cada A em A_candidates
O_candidates = união de invCeil(E, m) para cada E em E_candidates
```

O resultado elemental é um conjunto discreto de originais possíveis. Se `m`, `M` ou `P` forem desconhecidos, a evidência de original desse eixo é desconhecida, não contradição (D-006).

- **D-010b — Pipeline discreto de dano físico:** para reconstruir originais físicos a partir do dano observado, o classificador deve gerar intervalo de originais possíveis, porque o armor roll varia. A média física usada por calculadoras de DPT não deve ser usada para reverter um hit individual do Server Log. Hits marcados com `perfect shot` exigem, além desta cadeia, a reversão de **D-010f**.

```text
F = dano final exibido no Server Log
O = dano original físico antes de physicalMod
m = physicalModEfetivo, já incorporando physical pierce, Expose Weakness e demais alterações físicas conhecidas
M = mitigationMultiplier = 1 - mitigation / 100
P = postMitigationMultiplier = prey e demais multiplicadores pós-mitigação conhecidos; se ausente, P = 1

armorEff = ROUND(armor × (1 - armorPenetration))
armorLow = MAX(FLOOR(armorEff / 2), 0)
armorHigh = MAX(FLOOR(armorEff / 2) × 2 - 1, 0)

E = CEIL(O × m)
R = armorRoll, com R ∈ [armorLow, armorHigh]
A = MAX(E - R, 0)
B = FLOOR(A × M)
F = FLOOR(B × P)
```

Para hits positivos em que `A > 0`, a inversão física deve usar:

```text
B_candidates = invFloor(F, P)
A_candidates = união de invFloor(B, M) para cada B em B_candidates

A_min = menor valor em A_candidates
A_max = maior valor em A_candidates

E_min = A_min + armorLow
E_max = A_max + armorHigh

O_min = FLOOR((E_min - 1) / m) + 1
O_max = FLOOR(E_max / m)
```

O resultado físico é o intervalo `[O_min, O_max]`. Para hits zerados ou quase zerados, o caso `A = 0` deve ser tratado separadamente, porque a armadura pode absorver todo o dano físico antes da mitigação.

- **D-010c — Modificador efetivo por pierce/Expose Weakness:** pierce e Expose Weakness não devem ser aplicados como bônus final direto de dano. Eles alteram o modificador efetivo `m` usado em `CEIL(O × m)`. Quando o modificador base do mob e o pierce forem conhecidos, usar:

```text
effectiveMod(baseMod, pierce):
    se baseMod <= 0:
        return baseMod

    toNeutral = MAX(0, 1 - baseMod)
    first = MIN(toNeutral, pierce)
    remaining = pierce - first
    second = CEIL(ROUND(remaining × 100) / 2) / 100

    return MIN(baseMod + first + second, baseMod × 2)
```

Expose Weakness adiciona `0,08` de pierce a todos os elementos e ao físico antes de calcular `effectiveMod`.

`active elemental amplification`, quando aparece no sufixo de uma linha de dano do Server Log, é um fato observado daquele hit e adiciona `0,16` de pierce antes de calcular `effectiveMod`. Esse bônus se aplica tanto aos eixos elementais quanto ao eixo físico, e não é multiplicador final de dano. Ele deve ser somado às demais fontes conhecidas de pierce do hit, como Expose Weakness e BM/Battle Momentum, antes da inversão discreta de D-010a ou D-010b. A presença desse sufixo não prova BM; quando ambos forem possíveis, o classificador deve comparar a hipótese com `active elemental amplification` isolado contra `active elemental amplification + BM` usando a coerência global de originais.

- **D-010c-nota — Limitação conhecida e aceita: `active elemental amplification` bugada no jogo (pierce 0%).** Observação do domínio (usuário, 13/Jul/2026): a mecânica `active elemental amplification` está **bugada no cliente do jogo e concede 0% de pierce**, não os `0,16` que a spec acima modela. A spec permanece **inalterada** de propósito: `0,16` é o comportamento pretendido da mecânica, e modelar o valor bugado (`0`) acoplaria o classificador a um bug transitório do jogo — exigiria, quando o bug for corrigido, uma troca por data no estilo pré/pós-cutoff do bestiário, que o usuário **decidiu explicitamente não introduzir**. A discrepância é invisível em mobs neutros/vulneráveis (`holyDmgMod ≥ 1`, que deslocam juntos e permanecem auto-consistentes) e só quebra a reconstrução quando um mob **resistente** (`holyDmgMod < 1`, ex.: `darklight striker` = 0,9) com amplification cai num bloco holy: o `+0,16` infla o `effectiveMod` do mob resistente (conversão 1:1 até neutralidade, C-012) e derruba seu original ~30 abaixo do cluster, esvaziando a homogeneidade holy (S-004a). **Turnos afetados, marcados como comportamento conhecido e escolhido não trabalhar** (permanecem `unresolved`, não são regressão nem alvo de correção): `mazzerinbarrage` sessão salva `Thu Jul 09 01:26:16 2026` — turnos `01:25:57` e `01:26:06` (Divine Caldera com `darklight striker` amplificado). Prova de que a causa é a amplification: fixando EW/BM e zerando só o pierce da amplification, os dois blocos ficam homogêneos (`01:26:06` → holy O comum `[829–832]`; `01:25:57` → `[865–868]`), strikers reintegrados; com `0,16` o striker fica isolado ~30 abaixo. Nenhum outro turno do corpus pós-cutoff depende dessa combinação.

- **D-010d — Originais pós-crítico e dano base normalizado:** o classificador deve distinguir dois níveis de comparação. Para segmentar blocos com o mesmo crit-state, comparar o original reconstruído compatível com o estado observado do hit. Para comparar hits de crit-state diferente, remover o multiplicador de crítico, Onslaught, fatal, prey e demais multiplicadores conhecidos antes da interseção; Low Blow usa o mesmo multiplicador de crítico do componente porque é chance de crítico por mob/hit, não dano extra próprio. A normalização não pode apagar a diferença de estado: hits críticos, Low Blow, Savage Blow e Onslaught permanecem marcados separadamente conforme D-007, D-008, D-008a, D-009 e U-011 a U-013. Savage Blow só pode ser comparado com crítico normal depois de normalização canônica do seu bônus; sem ela, é estado determinístico separado.

- **D-010e — Proibição de média física para hit individual:** funções de dano físico médio esperado, úteis para DPT, não são evidência válida para reverter um hit individual. Em hit observado, o eixo físico deve ser representado por intervalo gerado por `armorRoll ∈ [armorLow, armorHigh]`, nunca por média de armor.

- **D-010f — Reversão de Perfect Shot (vale nos DOIS eixos):** `perfect shot`, quando aparece no sufixo de uma linha de dano do Server Log, é um fato observado daquele hit e adiciona um bônus **aditivo em dano** (não multiplicador) de `PERFECT_SHOT_PREMIT_BONUS`. Na cadeia discreta, o bônus é somado **depois do multiplicador de crítico e antes da mitigation** — entre `A` e `B` na notação de D-010b, e na posição equivalente de D-010a. Ao reconstruir o original de um hit marcado, o classificador deve subtraí-lo exatamente nessa posição, **tanto no eixo físico (D-010b) quanto no eixo elemental (D-010a)**.

  O bônus **não** é multiplicativo e **não** entra em D-009a: D-009a trata de bônus que alteram o multiplicador de crítico (Onslaught soma `+0,6` ao multiplicador, mesmo modelo de Transcendence). Implementar Perfect Shot como multiplicador é erro.

  Subtrair o bônus na posição errada da cadeia não é equivalente: aplicá-lo depois da inversão do modificador elemental produziria `O = (F/…)/m − bônus/m` em vez de `O = ((F/…) − bônus)/m`, e como `m` varia por mob a diferença é da ordem de 2 a 3 pontos de original — a mesma ordem de grandeza da tolerância que separa bloco de fronteira (S-004a/S-005).

  Toda memoização de reversão deve distinguir hits com e sem o bônus. Dois hits de mesmo dano exibido, mesmo mob e mesmo estado de modificadores — um marcado e outro não — têm originais **diferentes** e não podem compartilhar entrada de cache.

  Caso-prova: `thunder arrow` (sessão `21/Jul/2026`, munição de área elemental) turno `18:57:18` — o hit `oozing corpus 615 (perfect shot, increased damage by Expose Weakness)` reverte no eixo de energy para `O=503` sem a reversão, contra `O ∈ [485,488]` de dois `oozing corpus 595 (increased damage by Expose Weakness)` do **mesmo mob e mesmo estado**. Por S-004a isso é fronteira obrigatória e mata a partição. Com a reversão, o hit marcado vai para `O=487`, dentro de `[485,488]`, e a violação same-mob desaparece. Medido sobre os 24 turnos de AA-puro do fixture: os blocos que fecham no eixo de energy sobem de **10 para 14**. Enquanto todo AA de RP foi físico a omissão foi invisível, porque Perfect Shot só marca hits de AA e o AA nunca passava pelo eixo elemental (S-007).

- **D-010g — Bounty Talisman: fato, grade e bônus de dano pós-mitigation:** o
  sufixo observado `Bounty Talisman Effect: More Damage Dealt` é um fato
  próprio do hit e NÃO é `active prey bonus`. `isPrey` continua significando
  somente Prey; o Bounty deve possuir flag separado e não pode ativar o
  multiplicador fixo `1,25` de Prey.

  O efeito `Bonus Damage Against Task Creatures` usa nível inteiro `L >= 0` e
  a grade oficial abaixo. O nível 0 já concede `2,5%`; não existe candidato de
  Bounty ativo com bônus zero.

```text
bountyBonus(L) =
    0,025
    + 0,005 × MIN(L, 15)
    + 0,0025 × MAX(L - 15, 0)

L=0  -> 2,5%
L=14 -> 9,5%
L=15 -> 10%
L=16 -> 10,25%
L=25 -> 12,5%
L=26 -> 12,75%
```

  O nível de dano é inferido por sessão antes da classificação local. Quando
  houver proc determinístico comparável do mesmo `(mob, charm, estado de
  Expose Weakness e demais modificadores conhecidos)`, com e sem Bounty, essa é
  a testemunha primária: cada lado precisa do mesmo piso de `>=3` procs de
  C-012a/M-036, o cluster dominante protege contra truncamento por vida
  restante e o candidato deve reproduzir o valor marcado pelo round-trip
  discreto de D-010a. Prey+Bounty continua excluído dessa prova enquanto sua
  composição não estiver comprovada. Procs dentro de janela ainda não resolvida
  de `utevo grav san` também não podem votar.

  O veredito exige vencedor único e unanimidade entre todas as linhas
  discriminantes. Se não existir testemunha comparável suficiente, o fallback
  pode usar somente componentes determinísticos ou Mana Leech cujo `N_leech`
  já esteja congelado por evidência independente do candidato. Aplicar um nível
  não pode mover fronteira, alterar cardinalidade ou promover a própria
  observação a “ouro” para depois votar nesse mesmo nível. Capped-low e
  overkill não fixam nível. A grade não recebe teto arbitrário: somente níveis
  contidos num intervalo finito imposto por evidência limpa podem ser
  enumerados. Empate, conflito, ausência de intervalo finito ou evidência
  insuficiente deixam o nível `unknown`.

  Com nível conhecido, o multiplicador `1 + bountyBonus(L)` entra em `P` de
  D-010a/D-010b somente para o hit marcado. O mesmo multiplicador é removido do
  dano exibido antes de usar esse dano como base de D-023/D-024: o bônus
  aumenta o dano final, não a taxa base de leech. Hit sem o sufixo não recebe o
  efeito, ainda que seja do mesmo mob de hits marcados. Se o nível estiver
  `unknown`, o original que depende dessa reversão é evidência ausente
  (D-006), nunca calculado silenciosamente com `P=1` ou `P=1,25`.

  Prey e Bounty simultâneos devem permanecer como dois fatos observados, mas,
  enquanto não houver regra de composição comprovada, esses hits não podem
  fixar o nível do Bounty nem sustentar veto determinístico baseado na
  composição dos dois multiplicadores.

  Decisão de domínio confirmada pelo usuário em `04/Aug/2026`. Caso-prova:
  `uhax 3` S1, salva em `03/Jul/2026`, infere dano nível 26 (`+12,75%`):
  poison charm sem EW `2089 -> 2355` e com EW `2161 -> 2436`; níveis
  25 e 27 não reproduzem nenhum dos dois pares. O Terra Wave `13:39:15`
  confirma o mesmo nível por original comum 1290. S0, salva em `30/Jun/2026`,
  não contém Bounty e não herda esse setup.
- **D-011 — Overkill:** não participa de interseções, médias, magnitude ou comparação de leech. A proibição de leech aqui se refere à *razão* leech/dano; o leech **absoluto** permanece válido em overkill conforme D-019.
- **D-011a — Atribuição de XP exige continuidade causal:** uma linha de XP só
  prova overkill do hit anterior quando a relação permanece contínua na ordem
  integral das linhas timestampadas do Server Log. Para `hit → XP`, podem ser
  transparentes as sublinhas já pertencentes à cadeia do ataque
  (`life/mana leech`, charm e reflection); para `charm → XP`, `life/mana
  leech`. Outra ação explícita do jogador que esteja ausente do vetor de eventos
  do passe — atualmente o uso de poção, já reconhecido pelo
  `potionUsePattern` canônico — rompe a continuidade e torna a autoria do XP
  desconhecida. Uma notificação de estado do mundo ou dano recebido pode ser
  intercalado pelo servidor e, sozinho, não prova uma nova autoria; fatos já
  modelados continuam bloqueando pelo próprio critério de “próximo evento
  relevante”. Evidência ausente não pode virar `overkill` nem `killedTarget`
  (D-006/C-003). A janela temporal vigente de até um segundo permanece
  necessária, mas não substitui a continuidade.
  Caso-prova: `jaded S7`, sessão salva em `10/Jun/2026`, turno `21:01:52`.
  Depois do hit `seq 3894` (`mycobiontic beetle 825`) existe uso de poção antes
  do XP de `21:01:53`; portanto o hit permanece
  na Divine Caldera com `overkill=false`, e o turno continua `A8 S7 G7`.
  Controle positivo: `kim 16:23:25`, onde `divine wrath charm` é seguido pela
  notificação `One or more primal pods have spawned.` e então por XP no mesmo
  segundo; a notificação não é nova ação do jogador, o charm mantém
  `killedTarget=true` e Energy Wave continua com 5 hits.
- **D-012 — Herança de overkill:** recebe o componente do bloco contíguo definido pelos outros hits; nunca cria fronteira.
  - **D-012a — Turno 100% overkill não admite fronteira sem evidência independente:** quando
    **todos** os hits principais elegíveis de um turno são overkill, não existe "outro hit"
    para definir bloco algum, e a cláusula "nunca cria fronteira" de D-012 passa a valer para
    a partição inteira. Nesse cenário, uma partição com dois ou mais componentes só é
    admissível se a fronteira tiver apoio **independente do overkill**: mudança de segundo
    (M-005/M-012), mudança de crit-state (D-007/S-008), linha `Using` de runa (M-017) ou
    janela de explosão de granada (M-023). Sem nenhum desses, apenas hipóteses de componente
    único permanecem candidatas. Caso-prova: `barrage 19:04:08` — 4 hits, todos críticos e
    todos overkill, no mesmo segundo, com `exevo mas san` como único cast: o corte `A3|S1`
    era criado exclusivamente entre overkills, e o resultado correto é `A0 S4`.
  - **D-012b — Nota de implementação: por que a invalidação NÃO vai no teste de leech.** A
    leitura literal de D-019/D-025 sugere invalidar a hipótese de `N` sempre que
    `danoMostrado > Dreal_max` num hit de overkill — e ela é logicamente correta (o dano
    exibido é piso do real; o comentário "V27" em `js/unified-validation.js`, que afirma o
    contrário, é refutado por `bastion 15:21:16`, onde o hit `340 OK` tem `life 431`, leech
    **maior** que o dano exibido). Essa versão foi **implementada e medida em 22/Jul/2026, e
    revogada**: transformar aquele ramo em contradição não faz o motor rejeitar a partição —
    faz ele **escapar** para um `N` maior inserindo hit virtual (S-014e), fabricando hits que
    não existem no log. Medição no escopo `bastion`/`essence`/`bakradrone`/`barrage`/
    `mazzerinbarrage`: **42 turnos ganharam hit virtual** contra 5 reclassificações reais, e o
    caso normativo `barrage 18:59:58` quebrou (`A4 S5` → `A4 S6` virtual). Nem o gabarito nem
    a varredura de invariantes detectaram 41 das 42 fabricações. A invalidação correta é a de
    D-012a, no ponto onde a fronteira é decidida (validação de partição), não onde a
    contradição é medida.
- **D-013 — Leech:** usar `(lifeLeech + manaLeech) / dano` somente em hits não-overkill. Esta restrição vale para a *razão*; o leech **absoluto** (`lifeLeech + manaLeech`, sem dividir pelo dano) é tratado por D-019.
- **D-014 — Leech secundário:** confirma ou desempata; não substitui dano, ordem ou cooldown.
- **D-015 — Associação:** leech só pode ser ligado ao último hit ofensivo elegível do mesmo timestamp.
- **D-016 — Regime temporal de modificadores:** logs com data anterior a 16 de junho de 2026 devem usar os modificadores de mob atuais, preservados em `js/mob-element-mods.js`. Logs de 16 de junho de 2026 em diante devem usar exclusivamente `js/mob-element-mods-post-2026-06-16.js`. Enquanto o conjunto pós-corte não estiver preenchido, seus modificadores são evidência ausente conforme D-006; é proibido aplicar silenciosamente os valores pré-corte. Sessão sem data também não pode escolher um regime por suposição.
- **D-017 — Escopo transitório de revisão (CONDIÇÃO EXPIRADA em 09/Ago/2026):** enquanto o conjunto pós-16 de junho não estiver preenchido, as avaliações normativas **de mitigação** devem revisar somente sessões anteriores a 16 de junho de 2026 e registrar sessões posteriores ou sem data como fora do escopo, sem tratá-las como aprovadas pelo regime antigo.

  **A condição desta regra já não vale.** `js/mob-element-mods-post-2026-06-16.js` está preenchido (813 entradas, com `hitpoints` e `bestiaryClass`) e é a base de M-036, C-012a, D-010g e da reversão pós-corte inteira. Logo a restrição transitória acima está **encerrada**: nenhuma avaliação normativa pode mais recusar uma sessão pós-corte alegando D-017.

  - **D-017a — D-017 nunca foi gate de invariante mecânico:** o escopo transitório acima é sobre **avaliação de mitigação** — não sobre M-009, M-012/M-013, M-015, M-024, M-025, T-003/T-004, T-006, cardinalidade ou rótulos concretos, que não dependem da tabela de mods e valem em **qualquer** regime. A varredura de invariantes mecânicos (`tools/unified-invariants.mjs`) DEVE cobrir **todas** as sessões de **todos** os pares descobertos, em qualquer regime e inclusive sessões sem data. As **únicas** exclusões admitidas são as canônicas de `CORPUS_EXCLUSIONS` (`tools/unified-corpus.mjs`), aplicadas em `corpus.sessionsFor`. É proibido reintroduzir recorte por data na varredura, e um fixture só pode aparecer como `SKIP` por ausência de arquivo ou por não ter nenhuma sessão classificável — nunca por regime.

    Motivo registrado: até 09/Ago/2026 a varredura aplicava D-017 como gate cego de data e pulava **17 dos 34 fixtures**, deixando o regime pós-cutoff inteiro sem cobertura de invariante. Isso escondia **5 quebras em turnos resolvidos**: `kim` `14/Jul/2026 16:24:30`, `rpboss` `17/Jun/2026 09:40:33`, `uhax 3 ed` `03/Jul/2026 13:43:55` (duas: M-012/M-013 e M-015) e `13:44:09`. A cobertura é travada por teste em `tests/unified-invariants.test.mjs`.

  - **D-017b — D-016 é auditada nos dois sentidos:** a violação de seleção de regime é **D-016**, não `D-016/D-017` — sessão datada antes de 16/Jun/2026 deve usar a tabela pré-corte e sessão datada de 16/Jun/2026 em diante deve usar exclusivamente a pós-corte. Sessão **sem data** não pode escolher regime por suposição (D-016) e por isso não é auditada por essa invariante: ausência de data é evidência ausente (D-006), não contradição.
- **D-018 — Desempate entre AA single-target e spell:** quando um hit candidato a AA single-target e um hit candidato a spell tiverem o mesmo valor de dano no mesmo turno e as evidências anteriores não resolverem a atribuição, usar a razão de leech definida em D-013 como desempate: o hit com maior leech por dano deve ser classificado como AA. Hits de overkill são obrigatoriamente excluídos desse desempate, pois distorcem a razão de leech por dano.
- **D-019 — Leech absoluto sob overkill:** o leech é creditado sobre o dano cheio que o hit causaria com o alvo em vida plena, não necessariamente sobre o dano truncado por overkill exibido no Server Log. Por isso, em overkill, a razão `leech / danoMostrado` é inválida, mas o leech absoluto permanece válido. O uso preferencial do leech absoluto é separado por vida e mana, aplicando D-020 a D-027. A soma `lifeLeech + manaLeech` pode ser usada apenas como fallback diagnóstico quando vida e mana isoladas não forem suficientes. O outlier de leech absoluto é um caso particular da cardinalidade por leech: ele separa um bloco `N = 1` de um cluster em área `N = k` quando o overkill impede comparação por dano exibido. Em um turno dominado por overkill, no qual a razão de leech não pode desempatar por faltarem hits não-overkill suficientes, os hits de uma mesma ação de área tendem a formar um cluster coeso de dano real reconstruído por leech, enquanto um AA single-target tende a aceitar `N = 1` e ficar fora do bloco em área. Essa evidência nunca cria segundo AA (M-032), nunca sobrepõe evidência determinística mais forte e nunca autoriza violar ordem, cooldown, topologia ou casts concretos.

- **D-020 — Fontes conhecidas de leech do personagem:** o leech base do personagem deve ser inferido ou validado somente a partir de fontes mecânicas conhecidas, cada uma limitada ao seu teto real de stacks:
  - **Imbuement** (até 2 slots de equipamento, cada slot Basic/Intricate/Powerful, combináveis entre si): Life Leech Basic 5%, Intricate 10%, Powerful 25% (teto 2×25% = 50%); Mana Leech Basic 3%, Intricate 5%, Powerful 8% (teto 2×8% = 16%).
  - **Conviction Perk** (Wheel of Destiny, até 4 stacks): Life Leech +0,75% por stack (teto 4×0,75% = 3%); Mana Leech +0,25% por stack (teto 4×0,25% = 1%).
  - **Perk de arma** (até 10 stacks para Life Leech, até 4 stacks para Mana Leech): +1% por stack em ambos os canais (teto Life 10×1% = 10%; teto Mana 4×1% = 4%).
  É proibido ajustar livremente um percentual arbitrário de leech apenas para fazer um turno fechar. O setup de leech deve ser uma combinação plausível dessas fontes, testando todo o espaço de stacks de cada uma (imbuement × Conviction Perk × perk de arma), não apenas 0 ou 1 stack de Conviction/perk de arma.

- **D-020a — Grade de imbuement restrita a Powerful (premissa de personagem, não regra de jogo):** para os personagens analisados neste projeto, a grade de candidatos de imbuement de leech usada em D-020 considera somente o tier Powerful por slot (`Life Leech Powerful 25%`, `Mana Leech Powerful 8%`), excluindo Basic e Intricate do espaço de busca. Isso é uma premissa confirmada sobre esses personagens específicos (nunca usam imbuement Basic/Intricate de leech) — D-020 continua descrevendo os 3 tiers como mecânica real de jogo, válida em geral. Limitação conhecida e aceita: essa restrição pode custar turnos que só fecham com uma combinação de base usando Basic/Intricate — caso confirmado na sessão `jaded` (corpus pós-cutoff), onde restringir a Powerful-only custa 8 turnos que resolviam corretamente com a grade completa. Se um novo personagem/log exigir Basic/Intricate real, esta constante (`LIFE_IMBUEMENT_SLOTS`/`MANA_IMBUEMENT_SLOTS` em `js/unified-classification-engine.js`) precisa ser revisitada.

- **D-021 — Minor charms de leech por mob:** bônus de leech a nível de mob só pode vir de `Vampiric Embrace` ou `Void’s Call`. `Vampiric Embrace` aumenta Life Leech em +1,6%, +2,4% ou +3,2%. `Void’s Call` aumenta Mana Leech em +0,8%, +1,2% ou +1,6%. Somente um mob pode possuir bônus de Life Leech e somente um mob pode possuir bônus de Mana Leech. O mesmo mob nunca pode possuir os dois bônus ao mesmo tempo: se um mob tem `Vampiric Embrace`, ele não tem `Void’s Call`; se tem `Void’s Call`, ele não tem `Vampiric Embrace`. Uma hipótese que exige os dois bônus no mesmo mob é mecanicamente inválida.

- **D-021a — Detecção de mob candidato a minor charm por evidência turn-local:** qual mob é candidato a minor charm (D-021) deve ser determinado por evidência turn-local, não por uma varredura cega a mob na sessão inteira: para cada turno já resolvido sem depender de leech (turno-ouro) cujo componente atinge 2 ou mais mobs distintos, comparar a razão `leech / leechDamageBasis(hit)` de cada mob contra a mediana dessa razão nos demais mobs do MESMO turno/componente (leave-one-mob-out — dentro do mesmo turno/componente, `N_leech` e a taxa base do personagem são idênticos para todos os hits por construção, então qualquer desvio só pode vir de um bônus de mob real). A razão DEVE usar `leechDamageBasis` (que já divide por Prey Bonus e `utevo grav san`), nunca o dano exibido bruto — um mob com Prey Bonus ativo na maioria dos hits produz um desvio de razão que não é minor charm se comparado por dano bruto. Um mob cujo desvio agregado (mediana dos deltas turno-a-turno, com evidência mínima de hits e turnos distintos) é consistentemente positivo e destacado num canal é candidato a minor charm daquele canal; a busca de base×bônus (D-020/D-021) testa bônus apenas nos mobs candidatos identificados, não em todo mob presente na sessão. **Uma vez satisfeito esse gate turn-local, a busca conjunta de C-006 deve avaliar o candidato na grade oficial de base×bônus contra a sessão inteira; ela não pode reaplicar um segundo piso fixo de quantidade de contradições corrigidas para descartar o candidato.** Quando nenhum mob atende ao limiar mínimo de evidência (incluindo sessões sem turnos co-localizados possíveis, como boss único), o resultado é ausência de `vampiricMob`/`voidsMob`, não um candidato forçado. Um mob só é elegível como candidato se estiver presente na tabela de mods do regime da sessão (D-016) — isso exclui bosses (nunca presentes nessas tabelas, D-006) — e `bloodjaw` é excluído explicitamente mesmo estando presente na tabela pós-cutoff (entrada manual, não vem do bestiário real). Casos-prova do gate único: em `serverlog6 07:11:12`, `Vampiric Embrace +3,2%` no raubritter skirmisher faz `724`/Life `400` fechar `N=1`; em `serverlog8 07:22:57`, o mesmo charm faz `813`/Life `449` fechar `N=1`.

  **Candidato aprovado no gate não pode ser descartado por falta de observação-ouro
  própria.** O gate turn-local e a observação-ouro com `N` conhecido são canais de evidência
  distintos e de densidades muito diferentes: o primeiro consome qualquer componente
  co-localizado de turno resolvido; o segundo exige turno-ouro. Uma sessão pobre em
  turnos-ouro pode aprovar um mob no gate e mesmo assim não ter nenhuma observação-ouro
  daquele mob — e nesse caso a busca conjunta é **cega**, porque todo bônus da grade empata
  em zero melhoria. O motor não pode cruzar os candidatos do gate com os mobs observados e
  deixar o candidato cair silenciosamente. Quando o mob candidato não tem observação-ouro, o
  nível do bônus vem do próprio delta turn-local, convertido **por observação** —
  `bônus ≈ delta_i / areaFactor(N_i)`, agregado pela mediana, nunca com um `N` fixo, porque
  `areaFactor` varia de `0,25` (N=4) a `0,136` (N=25) dentro da mesma sessão e um `N` único
  desloca a estimativa em um degrau inteiro da grade. A estimativa só fixa nível quando está
  a no máximo metade da distância até a fronteira de decisão entre os dois valores vizinhos
  da grade (`|b − g₁| ≤ |g₁ − g₂| / 4`); fora disso o nível fica **indeterminado** e nenhum
  charm é fixado. Ausência de charm deve registrar qual dos dois motivos ocorreu: candidato
  ausente ou nível indeterminado. Caso-prova: `uhax 3` tem duas sessões do mesmo personagem
  na mesma hunt; S0 (226 turnos-ouro) infere `Vampiric Embrace +3,2%` em `darklight matter`
  por pontuação, e S1 (46 turnos-ouro) aprova o mesmo mob no gate (delta `0,00606` contra
  `0,00616` de S0) mas não tem observação-ouro dele. A conversão por observação dá `0,03176`
  em S0 e `0,03197` em S1 — ambas a menos de `0,0003` do valor `0,032` da grade, contra
  `0,008` até o vizinho `+2,4%`. Sem esta regra, S1 reportava ausência de charm e subestimava
  o Life Leech de `darklight matter` em 3,2 pontos percentuais.

  Duas hipóteses foram levantadas e **refutadas** nessa investigação; não repetir. (1)
  `manaBase = 0,1725` em vez de `0,17` para `uhax 3`, que faria um turno isolado fechar sem
  o `+1` de mana: o ranking do próprio pipeline mostra `0,17` com **1507 exatos / 73
  contradições** em S0 (1714 observações) contra `0,1725` com **664 exatos / 49
  contradições**, e em S1 `0,17` com 199 exatos / 0 contradições contra 77 exatos — era
  overfit de um turno contra 1941 observações. (2) Medir o efeito de um setup injetando
  `options.leechSetup` no motor: **método inválido**, porque essa opção desliga o pipeline de
  leech-ouro (`shouldGoldInferLeech`), mudando duas coisas ao mesmo tempo e reportando
  falsamente "zero turnos alterados".

- **D-022 — Leech efetivo por hit:** para cada hit, o classificador deve calcular separadamente `lifeLeechEfetivo` e `manaLeechEfetivo`. O `lifeLeechEfetivo` é igual ao Life Leech base do personagem somado ao bônus de `Vampiric Embrace` apenas se o mob atingido for o mob marcado por esse minor charm. O `manaLeechEfetivo` é igual ao Mana Leech base do personagem somado ao bônus de `Void’s Call` apenas se o mob atingido for o mob marcado por esse minor charm. Vida e mana devem ser avaliadas separadamente; a soma `lifeLeech + manaLeech` pode ser usada apenas como fallback diagnóstico, pois os bônus de mob podem afetar vida e mana em mobs diferentes.

```text
lifeLeechEfetivo(hit) = lifeLeechPersonagem + bonusVampiricEmbrace(mobDoHit)
manaLeechEfetivo(hit) = manaLeechPersonagem + bonusVoidsCall(mobDoHit)

se bonusVampiricEmbrace(mob) > 0:
    bonusVoidsCall(mob) = 0

se bonusVoidsCall(mob) > 0:
    bonusVampiricEmbrace(mob) = 0
```

- **D-022a — Perk pré-cutoff de Mana Leech em hits com Expose Weakness:** existe
  um perk **opcional** que, em sessões anteriores a `16/Jun/2026`, dá `+2` pontos
  percentuais na taxa efetiva de Mana Leech de cada hit marcado no Server Log com
  `increased damage by Expose Weakness`. O bônus é somado depois da base do
  personagem e do eventual `Void's Call`, antes da diluição por
  `areaFactor(N_leech)`. Ele não altera Life Leech e não existe em `16/Jun/2026`
  ou depois.

  **O perk é opcional, então sua presença é INFERIDA por sessão**, junto com a
  base e o minor charm, na mesma busca conjunta e com o mesmo comparador
  (`ok` decrescente, depois `exact`) — nunca por data, vocação, fixture ou limiar
  próprio. As duas hipóteses (`com perk` e `sem perk`) são pontuadas contra as
  observações-ouro da sessão e a melhor vence. A **hipótese neutra é `sem perk`**:
  leech observado pode ser truncado para baixo, nunca para cima, portanto só
  "observado ACIMA do esperado pela base" é prova positiva do perk, e empate exato
  mantém o perk desligado. Setup desconhecido implica `sem perk`.

  A base inferida e a validação por hit precisam usar **o mesmo modelo de taxa**:
  se a inferência escolhe `com perk`, a validação cobra o bônus; se escolhe
  `sem perk`, não cobra. Inferir a base sem o bônus e cobrá-lo na validação faz a
  base absorver o efeito do perk e o hit ser cobrado duas vezes.

```text
se dataSessao < 16/Jun/2026 e sessao.perkManaLeechEW e hit.exposeWeakness:
    manaLeechEfetivo(hit) =
        manaLeechPersonagem + bonusVoidsCall(mobDoHit) + 0.02
senão:
    manaLeechEfetivo(hit) =
        manaLeechPersonagem + bonusVoidsCall(mobDoHit)
```

  Decisão de domínio confirmada pelo usuário em `31/Jul/2026` (existência do
  bônus) e em `06/Ago/2026` (o bônus vem de perk opcional e precisa ser
  inferido). Casos-prova do **perk presente**: `essence` S0, onde `com perk`
  vence com base `20,25%`, `ok=211` e `high=34`, contra `ok=96` e `high=152` de
  `sem perk`. Casos-prova do **perk ausente**: `bakradrone` S0, onde `sem perk`
  vence com base `16,50%`, `ok=396`/`exact=290`, contra `ok=150`/`exact=101` de
  `com perk`; e `jaded` S6, `ok=698` contra `ok=356`. Note que em `bakradrone` a
  hipótese `com perk` produz MENOS contradições (`high=0` contra `15`) e ainda
  assim perde: contradição não é o critério, confirmação positiva é.

  Casos-prova de classificação: `ms boss` S14 `17:10:31` permanece
  `A0 + Great Fireball 8` e S22 `19:00:26` permanece `A0 + Great Fireball 6`;
  S14 `17:10:33` continua `A1 + Great Fireball 7`, porque o primeiro hit sem EW
  confirma `N_leech=1` por mana (`18` observado/esperado) e contradiz
  `N_leech=8`, enquanto o sufixo confirma `N_leech=7`. Em `uhax 3` S1
  `13:36:13`, o AA marcado tem EW; a taxa efetiva de Mana só é 19% se o perk
  tiver sido inferido nessa sessão, e Mana 24 observado é capped-low de qualquer
  forma, portanto não discrimina nível de Bounty.

- **D-022b — Bounty Talisman: multiplicador de Life Leech por hit:** o efeito
  `Life Leech From Task Creatures` usa a mesma grade discreta de D-010g, mas
  possui nível de sessão próprio. O nível de Life Leech NÃO é copiado,
  restringido nem desempatado pelo nível de dano.

  Para hit marcado com Bounty e nível de Life Leech conhecido, o bônus
  multiplica a taxa efetiva de vida depois da base e do eventual
  `Vampiric Embrace`, antes de `areaFactor(N_leech)` e do `CEIL`:

```text
lifeLeechEfetivo(hit marcado) =
    (lifeLeechPersonagem + bonusVampiricEmbrace(mobDoHit))
    × (1 + bountyLifeBonus)

lifeLeechEfetivo(hit sem marca) =
    lifeLeechPersonagem + bonusVampiricEmbrace(mobDoHit)
```

  O efeito não altera `lifeBase`, `manaBase`, `Void's Call`, Mana Leech nem o
  bônus pré-cutoff de EW. A inferência global deve avaliar conjuntamente
  `(lifeBase, Vampiric por mob, bountyLifeLevel)` sobre dano já normalizado por
  D-010g; o gate turn-local de D-021a deve consumir razões normalizadas ou
  excluir temporariamente hits marcados, para não converter Bounty em minor
  charm falso.

  Empate, evidência apenas capped-low/overkill ou ausência de intervalo finito
  deixam o nível `unknown`. Nesse estado o Bounty não pode ser usado como veto
  duro de cardinalidade. Caso-prova: depois de fixar Damage nível 26,
  `uhax 3` S1 infere Life nível 15 (`+10%`) pelos quatro AAs unitários
  `(dano, vida) = (155,47), (246,75), (136,42), (218,66)`;
  níveis 14/15/16 preveem respectivamente
  `(47,75,41,66)`, `(47,75,42,66)` e `(47,75,42,67)`.
  O restante do setup permanece `lifeBase=31%`, `manaBase=17%`,
  `Void's Call +1,6%` em `darklight striker` e `Vampiric Embrace +3,2%` em
  `darklight matter`. O mob marcado por Bounty, `walking pillar`, **não** tem
  minor charm algum — é isso que este caso-prova fixa, e não a ausência de
  `Vampiric Embrace` na sessão. (A redação anterior dizia apenas "nenhum
  `Vampiric Embrace` em `walking pillar`" e foi lida por engano como se S1 não
  tivesse o charm em mob nenhum; ver D-021a.) O AA
  marcado `13:36:13`, dano exibido 155, fecha
  `CEIL((155/1,1275) × 0,31 × 1,10)=47` de vida. O hit possui EW, então a Mana
  efetiva é 19% se o perk de D-022a tiver sido inferido nessa sessão e 17% caso
  contrário; nos dois casos Mana 24 observado é capped-low
  (`CEIL((155/1,1275) × 0,19)=27` e `CEIL((155/1,1275) × 0,17)=24`), portanto
  compatível mas não discriminante de nível de Bounty.

- **D-023 — Fórmula de diluição do leech por quantidade de hits:** para um componente que produziu `N_leech` hits principais elegíveis, o leech de cada hit deve ser calculado com o fator `areaFactor(N_leech) = (0,1 × N_leech + 0,9) / N_leech`, equivalente a `0,1 + 0,9 / N_leech`. O resultado de vida e mana é sempre arredondado para cima. Para `N_leech = 1`, o fator é `1`. `N_leech` é a quantidade de hits principais elegíveis do componente, independentemente de esses hits estarem em mobs diferentes ou no mesmo mob. É proibido interpretar `N_leech` como quantidade de mobs distintos.

```text
areaFactor(N_leech) = (0.1 × N_leech + 0.9) / N_leech
areaFactor(N_leech) = 0.1 + 0.9 / N_leech

vidaObservada = CEIL(danoReal × lifeLeechEfetivo × areaFactor(N_leech))
manaObservada = CEIL(danoReal × manaLeechEfetivo × areaFactor(N_leech))

N_leech = 1  → 1.000000
N_leech = 2  → 0.550000
N_leech = 3  → 0.400000
N_leech = 4  → 0.325000
N_leech = 5  → 0.280000
N_leech = 6  → 0.250000
N_leech = 7  → 0.228571
N_leech = 8  → 0.212500
N_leech = 9  → 0.200000
N_leech = 10 → 0.190000
```

- **D-024 — Candidato de cardinalidade por leech:** para cada hit com leech associado, o classificador deve testar candidatos inteiros de `N_leech`. Um hit aceita determinado `N_leech` quando o leech observado de vida e/ou mana é compatível com `CEIL(danoReal × leechEfetivo × areaFactor(N_leech))`. Quando não há overkill, `danoReal` pode ser o dano exibido no Server Log. Quando há overkill, o dano exibido não deve ser usado como limite superior; deve-se reconstruir o intervalo de dano real por D-025. `N_leech` nunca deve ser calculado por contagem de mobs distintos.

```text
para N_leech em 1..Nmax:
    F = 0.1 + 0.9 / N_leech

    vidaEsperada = CEIL(dano × lifeLeechEfetivo × F)
    manaEsperada = CEIL(dano × manaLeechEfetivo × F)

    se vidaEsperada == vidaObservada:
        hit aceita N_leech por vida

    se manaEsperada == manaObservada:
        hit aceita N_leech por mana
```

- **D-024a — Proibição de N por mob distinto:** é mecanicamente inválido reduzir `N_leech` porque dois ou mais hits do componente possuem o mesmo nome de mob, parecem atingir o mesmo alvo, ou pertencem à mesma criatura. O classificador não deve contar mobs distintos para o cálculo de leech; deve contar hits principais elegíveis do componente. Uma implementação ou revisão que rejeite `N_leech = k` com o argumento “os hits são no mesmo mob” viola esta regra.

- **D-025 — Reconstrução de dano real por leech:** em hits de overkill, o dano exibido no Server Log pode ser menor que o dano real usado no cálculo de leech. Nesses casos, o leech absoluto deve reconstruir um intervalo possível de dano real. A hipótese de `N_leech`, componente e setup de leech só é válida se o intervalo reconstruído existir e se o dano exibido for menor ou igual ao máximo possível desse intervalo.

```text
R = leech observado
Dreal = dano real usado no cálculo
L = leech efetivo
F = areaFactor(N_leech)

R = CEIL(Dreal × L × F)

R - 1 < Dreal × L × F <= R

(R - 1) / (L × F) < Dreal <= R / (L × F)

Dreal_min = FLOOR((R - 1) / (L × F)) + 1
Dreal_max = FLOOR(R / (L × F))
```

Se houver vida e mana:

```text
intervaloVida = [Dvida_min, Dvida_max]
intervaloMana = [Dmana_min, Dmana_max]

intervaloFinal = interseção(intervaloVida, intervaloMana)
```

Validação:

```text
hit válido se intervaloFinal não estiver vazio
hit inválido se danoMostrado > Dreal_max
hit overkill provável se Dreal_min > danoMostrado
overkillMinimo = Dreal_min - danoMostrado
```

- **D-026 — Proibição de razão sob overkill:** em hits de overkill, é proibido usar `leech / danoMostrado` como razão comparativa, porque o denominador está truncado. Nesses casos, somente o leech absoluto e os intervalos de dano real reconstruídos por D-025 são válidos. Esta regra preserva D-011, D-013 e D-018, mas amplia D-019: o leech absoluto não serve apenas para detectar outlier de AA; ele também serve para validar a cardinalidade `N_leech` de blocos candidatos.

- **D-027 — Associação de leech ao hit ofensivo:** linhas `You were healed for X hitpoints` e `You gained Y mana` só podem ser associadas ao último hit ofensivo principal elegível do mesmo timestamp ou da sequência imediata compatível. `You healed yourself` não é Life Leech ofensivo. `You gained mana` precedido por uso de mana potion não é Mana Leech ofensivo. `damage reflection`, `wound charm` e `overpower charm` não são hits principais para cardinalidade de componente e não devem consumir o pareamento de leech do hit principal.

- **D-028 — Independência entre leech e mitigação física:** a análise de cardinalidade por leech não depende da reversão de armor, mitigation ou physicalDmgMod. Esses dados podem ajudar a comparar originais físicos, mas não são pré-condição para testar `areaFactor(N_leech)`, CEIL, vida e mana observadas e reconstrução de `Dreal` em overkill. A ausência de armor, mitigation, physicalDmgMod ou originais físicos (inclusive no regime pós-16 de junho de 2026, D-016) **não desativa** a cardinalidade por leech: ela apenas remove o eixo físico como evidência adicional. `N_leech` é a quantidade de hits principais elegíveis do componente; não depende de armor, mitigation ou physicalDmgMod e não é quantidade de mobs distintos (D-024a/S-014a/S-014b).

- **D-029 — Leech por cardinalidade é independente do tipo de componente:** a fórmula de leech por `N_leech` (D-023/D-024) e a consistência de leech como fronteira (S-014/S-018) devem ser aplicáveis a **qualquer** componente que produza hits principais elegíveis: AA single-target, AA de área, spell, runa ou granada. A topologia e o nome da ação podem validar ou invalidar uma hipótese posteriormente (Fase 2), mas **não podem impedir** o teste de leech do bloco candidato. Em particular, a **consistência do canal de vida** (life-leech) é evidência de segmentação como qualquer outra: um componente tem comportamento de life-leech coerente, então a transição onde o life-leech **liga** — um prefixo contíguo de hits principais não-overkill sem life-leech seguido de um sufixo com life-leech presente e consistente — é uma fronteira entre dois componentes, mesmo quando o mesmo mob aparece nos dois lados (mob alvo igual com comportamento de leech diferente **reforça** a fronteira, D-024a). O cap de HP (life-leech zera no fim do sufixo porque a vida já está cheia) não cria fronteira: só a transição `0 → presente` no prefixo conta.

- **D-030 — Fallback global de `utevo grav san` por dano/leech:** o tier de dano
  de `utevo grav san` é único por sessão e pertence à grade finita `+8%`, `+10%`
  ou `+12%`. Override explícito tem precedência; sem override, dano de charm
  comparável dentro/fora das janelas `cast..cast+5s` permanece a testemunha
  primária. O fallback desta regra só pode rodar quando existe ao menos um cast
  e **zero** procs internos com baseline externo comparável para a mesma chave
  `mob × prey-state × charm`; testemunha comparável que empata, conflita ou não
  fecha tier mantém o setup desconhecido e não pode ser encoberta pelo fallback.

  Na ausência real de testemunha comparável, o motor deve inferir o tier pelo
  fato mecânico de que Grav San aumenta o dano mostrado, mas **não** aumenta as
  taxas de life/mana leech: para o modo ativo do tier `b`, a base de leech remove
  `(1+b)` do dano mostrado, além dos demais multiplicadores finais conhecidos;
  para o modo inativo, não remove. O bootstrap de `leechSetup` usado nessa
  comparação não pode receber hits de janelas cujo tier ainda esteja pendente.
  Somente componentes já resolvidos sem depender de leech, com ação, limites e
  `N_leech` congelados antes do teste, podem votar; testar um tier não pode
  mover fronteira, renomear ação nem alterar cardinalidade (C-005/C-006).

  Vida e mana são avaliadas separadamente com a tolerância já normativa de
  D-024. Em cada componente e tier, os modos ativo/inativo são ordenados
  lexicograficamente por: menos contradições (`observado > esperado` além da
  tolerância), mais fits, mais fits exatos e menor soma de resíduos dos fits.
  `capped_low` (`observado < esperado`) e canal ausente são neutros. O tier só é
  elegível naquele componente quando o modo ativo tem zero contradições, ao
  menos um fit e vence estritamente o inativo; entre tiers elegíveis, o melhor
  único recebe **um voto do componente**. Empate local gera abstenção. Hit
  principal overkill permanece no `N_leech` congelado (D-024a), mas seu dano
  truncado não produz fit/resíduo para este voto; proc anexo não vota nem
  incrementa `N_leech` (C-008).

  O tier global só é aceito com maioria estrita dos votos discriminantes por
  componente, todos com peso igual. Ausência de votos, empate ou pluralidade
  sem maioria mantém `bonus=0`; é proibido desempatar por quantidade de hits,
  erro agregado ou tamanho de AoE. Depois de um vencedor, refinamentos
  dependentes do multiplicador e a passada final são repetidos com o setup
  global fixo, preservando a decisão `gravSanActive=true/false` por componente
  da V18. Caso-prova da inferência: `logs/jaded Server Log.txt` +
  `logs/jaded Local Chat.txt`, sessão salva `10/Jun/2026`, deve inferir `+10%`
  sem charm comparável; no componente de granada de `21:01:52`, a mana normal
  `34,34,32,32,34,34` produz seis fits exatos sob `10%`, enquanto `8%` e `12%`
  só passam dentro da tolerância. Revisão humana de 29/Jul/2026 aprovou o
  resultado final `A8 + Divine Caldera 7 + Divine Grenade 7`: `seq 3894`
  pertence à Caldera e os sete hits da granada estão em `:53`. O flag falso de
  overkill em `seq 3894` continua sendo uma limitação separada do parser e não é
  corrigido por esta regra.


## 4. Formação dos turnos

- **T-001 — Ordem:** ordenar hits por timestamp e `seq`.
  - **T-001a — O timestamp observado é segundos do dia; a ordem cronológica é a ordem do
    log.** O `HH:MM:SS` do Server Log volta a zero quando a sessão atravessa a meia-noite,
    então ele **não** pode ser usado sozinho como chave de ordenação: os hits posteriores à
    virada seriam ordenados antes dos anteriores a ela, e a diferença temporal usada para
    formar turnos (T-002) ficaria negativa na emenda — o que funde no mesmo turno hits
    separados por quase 24 horas. A ordem cronológica real é a ordem das linhas do log, e o
    classificador deve derivar dela uma chave absoluta (`ts + 86400 × dias`), usada **apenas**
    para ordenar e para a aritmética de fronteira de turno. O `ts` exposto em turnos, hits,
    `clock`, ferramentas e UI permanece em segundos do dia. Consequência direta: `turns[0]` —
    o turno marcado como parcial por T-007 — é o primeiro turno **do log**, não o de menor
    `ts`. Caso-prova: `mazzerinbarrage` sessão salva `09/Jun/2026 00:00:54`, que vai de
    `23:21:27` a `00:00:50`; a marca de borda pertence a `23:21:27` (`seq 1`), não a
    `00:00:00`. Medido no corpus: 3 de 367 sessões cruzam a meia-noite.
    - **Limitação conhecida e aceita:** as janelas de ação (`actionsNearTurn`, janela de
      explosão de granada `[cast+2, cast+4]`, M-023) comparam o timestamp do cast do Local
      Chat com o do hit do Server Log, ambos em segundos do dia, e **não** são normalizadas
      por esta regra. Nos poucos segundos em volta da virada, essas janelas permanecem
      incorretas. Nenhum turno do corpus atual depende disso; corrigir exigiria propagar a
      normalização também para o Local Chat, e fica registrado aqui em vez de decidido em
      silêncio.
- **T-002 — Janela mecânica:** formar turnos independentes em blocos provisórios de 2 segundos. Um efeito atrasado comprovado de estágio declarado (M-016d/M-016e — Death Echo e Spiritual Outburst) permanece anexado à ação originária e não ancora nem desloca o próximo turno independente, mesmo quando o segundo do estágio atrasado também contém hits de um cast concreto diferente e legítimo (M-016e). Analogamente, um rollover de escrita de granada comprovado por M-024/M-025 pode atravessar essa borda provisória sem criar outro turno ou componente para o mesmo cast. Em ambos os casos, todos os hits continuam preservados e auditáveis no componente originário, e o turno seguinte precisa resolver depois da remoção do prefixo transferido.
- **T-003 — Preservar linhas:** nenhum hit ofensivo observado pode desaparecer.
- **T-004 — Um componente por hit:** cada hit pertence a exatamente um componente.
- **T-005 — Combinações permitidas:** um turno pode conter:
  - AA;
  - AA e spell;
  - AA e runa;
  - AA e granada;
  - AA, spell e granada;
  - AA, runa e granada;
  - spell e granada;
  - runa e granada.
- **T-006 — Combinação proibida:** spell e runa nunca podem coexistir no mesmo turno.
- **T-007 — Turno parcial:** o primeiro turno pode estar cortado pela sessão e deve ser marcado como parcial. Se o turno parcial possuir evidência ofensiva concreta suficiente no recorte para classificar todos os hits observados, ele continua classificável e auditável. Se, depois de aplicar normalmente todas as regras de segmentação, validação e nomeação, o primeiro turno parcial permanecer não resolvido, ele deve ser marcado como informação perdida de borda, não como falha operacional do classificador — inclusive quando uma ação concreta observada explicar apenas parte do recorte e os hits restantes dependerem de evidência anterior ao início do Server Log. Essa marcação não autoriza criar hits, confirmar estágio multietapa sem sua prova mecânica nem atribuir os hits restantes à ação concreta.

## 5. Classificação em duas fases

### Fase 1 — Segmentar

- **S-001 — Objetivo:** descobrir quantos componentes contíguos existem e quais hits pertencem a cada um.
- **S-002 — Independência:** não usar nome de ação, resultado legado ou `seed`.
- **S-003 — Todos os cortes:** considerar todos os cortes contíguos possíveis.
- **S-004 — Interseção:** hits do mesmo componente determinístico devem possuir interseção de originais.
- **S-004a — Exatidão same-mob/same-estado:** dentro de um bloco determinístico elemental, hits não-overkill do **mesmo mob** com o **mesmo estado de modificadores** (mesma presença de Expose Weakness, prey, elemental amplification e Perfect Shot, e mesmos flags de crit/Low Blow/Savage Blow/Onslaught) são comparações **exatas**: mesmo componente ⇒ mesmo dano final (D-010a é função determinística de `(O, m, M, P)`). Perfect Shot ausente é o valor zero desse estado, não evidência desconhecida; somente a tolerância cross-state já vigente pode comparar hits com presença diferente de Perfect Shot. Qualquer tolerância de interseção usada pela implementação para absorver resíduo de arredondamento discreto (ex.: quantização da mitigation) aplica-se **somente** entre mobs distintos ou entre estados distintos do mesmo mob; dentro do mesmo `(mob, estado)`, conjuntos de originais disjuntos são fronteira obrigatória (S-005) e invalidam o bloco — inclusive contra o fallback de cluster. Caso-prova: `mazzerinbarrage 23:46:36`, darklight matter+EW `F=986 ⇒ O={982}` vs `F=987 ⇒ O={983}` sob `P=1` — o 987 não pode pertencer à mesma Divine Caldera dos dois 986. Low Blow e Savage Blow entram aqui como estado do hit/mob, não como exigência de que todos os mobs do componente compartilhem o mesmo charm.
- **S-004b — Classes de diagnóstico determinístico (contradição × evidência ausente):** um veredito reprovado (`ok:false`) de bloco determinístico pertence a exatamente uma de duas classes, e o diagnóstico deve **declarar qual**, porque `ok:false` sozinho não distingue as duas e quem só lê o diagnóstico (auditoria de invariantes, relatórios) não pode reimplementar a regra que o produziu. As classes são: **(a) contradição mecânica** — o bloco viola S-004/S-005/H-001/H-002 e a partição precisa mudar; **(b) evidência ausente** (D-006) — a regra que produziu o veredito já declara que ele não rejeita o bloco. São de classe (b), e somente elas: **dispersão cross-mob** (`elemental_cluster_span_too_wide`), que V-015b/V-015d proíbem usar como rejeição porque mobs distintos revertem para originais distintos sem contradição; e **mecânica declarada de múltiplos níveis por-mob ainda sem rótulo** (`same_mob_state_exact_original_mismatch` num bloco isento pelo gate de S-004a — beam M-035, estágio não-elemental M-016e, Terra/Ice Burst, Chained Penance M-037), cuja isenção já significa ausência de evidência negativa, e cujo diagnóstico deve nomear a mecânica que isentou. A classe (b) do caso de isenção é atribuída **no ponto em que a isenção é decidida**, não dentro do validador elemental: o mesmo motivo `same_mob_state_exact_original_mismatch` continua sendo contradição num bloco cuja ação não declara múltiplos níveis. O padrão é **fail-loud**: veredito reprovado sem classe declarada conta como contradição, para que um motivo novo apareça em vez de passar silencioso. Declarar a classe não altera `ok`, veto, ordem de validação, tolerância nem partição escolhida — ela descreve um veredito já tomado. Casos-prova: `Mrowdy 2` S0 `17:55:02` (Energy Wave, 6 hits em 3 mobs ⇒ dispersão cross-mob) e `kim` S0 `16:12:55` (Great Energy Beam, `undertaker` `1580/2011 = 0,786` ⇒ isenção por M-035, dentro da fração declarada de M-035a).
- **S-005 — Fronteira obrigatória:** originais comparáveis e incompatíveis obrigam uma fronteira.
- **S-006 — Blocos unitários:** componentes com somente um hit são válidos.
- **S-007 — Físico:** AA e Ethereal Barrage exigem coerência entre intervalos físicos. O eixo do AA é físico **por padrão**, e só deixa de ser quando a própria sessão prova o contrário — ver **S-007b**. Ethereal Barrage é **sempre** física: é spell, tem elemento no perfil da ação, e não é munição.

- **S-007b — Eixo do bloco de AA é inferido por sessão (munição de área elemental):** o update do jogo que coincide com o regime pós-cutoff (D-016) introduziu munição de **área elemental** para Royal Paladin — flechas mais fracas que as físicas, usadas apenas onde o dano físico é muito resistido. Logo o bloco `arrow` não pode ter o eixo cravado como físico. A munição é escolha de equipamento: muda **entre** sessões, nunca dentro de uma, então a inferência é **por sessão**, no mesmo estilo do perk BM (C-012) e do setup de leech.

  **Eixos candidatos:** `physical`, `energy`, `ice`, `fire`, `earth`. `holy` é excluído por ser **circular** — é o eixo da própria spell usada como referência. `death` é excluído por não existir munição de área desse elemento.

  **Turnos elegíveis:** somente aqueles em que uma spell **holy de área** do dono do log (`exevo mas san` / `exori dir san`) separa a spell do AA. São excluídos: turnos com Ethereal Barrage (`exori dir moe`), porque é spell **física** e não separa do AA físico, enviesando a contagem a favor do eixo físico; e turnos com cast de granada (`exevo tempo mas san`) ou dentro da janela de explosão dela, porque o instante da explosão é incerto (M-023) e a granada é holy, indistinguível da spell de referência. A coleta de casts deve incluir os de granada — eles têm tipo próprio (`grenade`, não `attack`), e filtrar por `attack` torna essa exclusão **inerte**.

  **Critério:** para cada eixo candidato, contar em quantos turnos elegíveis existe **algum** corte contíguo prefixo→sufixo tal que o sufixo feche como holy e o prefixo feche como o eixo testado. Vence o eixo com maior contagem.

  **Desempate e ausência de evidência resolvem em físico, por regra.** Empate significa que os eixos são indistinguíveis naquela sessão, e portanto a escolha não altera a classificação; preferir o físico mantém a decisão neutra em sessão legada. Contagem zero em todos os eixos ⇒ físico. Esse resultado **não pode** depender da ordem de iteração dos candidatos.

  **Medição de aceitação (22/Jul/2026):** 51 sessões de RP — 36 elegem `physical` com evidência, **14 por ausência total de evidência** (27%, o que torna o padrão peça central e não caso de canto), e apenas `thunder arrow S0` (`21/Jul/2026`) elege `energy`, por 64 turnos contra 29 do físico. Nenhuma sessão antiga produziu eixo não-físico vencedor nem empatado.

  A inferência consome apenas turnos/hits do parser, casts do local chat, tabela de mods, `critSetup` e `pierce` — **não** usa partição resolvida (os cortes são buscados por força bruta), então não há circularidade com a resolução de turno.

  **Limitação conhecida:** o canal físico de C-012 (inferência de BM) é definido sobre hits de um componente `arrow` de RP, ou seja, assume AA físico. Numa sessão de munição elemental esse canal mede um eixo que não existe. Em `thunder arrow` o acoplamento é inerte porque o BM foi decidido pelo detector de charm (M-036, `confirmed_by_charm_damage`). Uma sessão de munição elemental **sem** evidência de charm exigiria tratar a ordem BM ⟷ eixo do AA explicitamente.
- **S-007a — Tolerância cross-hit na interseção física:** a interseção física
  de um bloco candidato (`validatePhysicalBlock`) tenta primeiro a interseção
  **exata** (tolerância 0, S-007) e só recorre a uma tolerância cross-hit
  fixa (`PHYSICAL_INTERSECTION_TOLERANCE`) se a interseção exata colapsar.
  Esta tolerância é **independente** da tolerância por-hit já existente
  (`ELEMENTAL_INTERMEDIATE_TOLERANCE`, usada na reconstrução individual de um
  único hit em `physicalOriginalInterval`/`elementalOriginalCandidates`) e do
  comportamento terminal/sticky de `intersectIntervals` (um colapso real no
  meio da cadeia continua terminal, sem "revive" por hit posterior — ver
  `openspec/changes/fix-physical-intersection-reset-bug`, arquivado).
  Uma tentativa anterior de tolerância cega nesse mesmo ponto foi
  **implementada, medida e revogada**: magnitude de gap sozinha não distingue
  ruído de quebra genuína — o gap de uma quebra genuína medida
  (`mazzerinbarrage 23:48:21`, bloodjaw) era **4**, menor que um gap de
  ruído (**42**) causado por crítico mal estimado em outro turno; corrigir as
  causas-raiz do ruído (crítico com fallback grosseiro + `Transcendence` não
  modelada; `active elemental amplification` nunca implementada) eliminou a
  maior parte do ruído sem tolerância nenhuma. `PHYSICAL_INTERSECTION_TOLERANCE
  = 4` só foi aceito depois de validado contra esse mesmo caso-prova mais
  restritivo (`mazzerinbarrage 23:48:21` continua `A11 S11`, não é mascarado)
  e contra todos os fixtures do Eixo 2-físico (`barrage 18:59:18`/`19:00:30`/
  `19:01:17`/`19:02:45`/`19:03:32`/`19:04:40`, todos idênticos ao
  comportamento sem tolerância). Caso-prova que motivou a regra: `mk
  19:50:08` (sem BM, sem `Transcendence`, sem `active elemental
  amplification` na janela do turno) — sob a hipótese de crítico mais bem
  apoiada em evidência (`bucket_two_pass=1.62`, 865 amostras não-críticas),
  o bloco `arrow` de 7 hits críticos falhava a interseção física por só 2
  unidades de `O` entre `darklight matter` (armor 98) e `walking pillar`
  (armor 120) — resíduo consistente com quantização discreta do modelo de
  armor (`armorLow=floor(armorEff/2)`, `armorHigh=floor(armorEff/2)*2-1`,
  calculado independentemente por mob), não com um componente físico
  distinto escondido no bloco. Com a tolerância, o turno resolve `A7 R10`
  (auto-ataque + great fireball rune), como esperado. Ver
  `openspec/changes/add-physical-intersection-tolerance`.
- **S-008 — Crit-state misto:** um bloco determinístico com estados incompatíveis é inválido. A incompatibilidade de crit-state é de componente/ação; Low Blow e Savage Blow são fatos por mob/hit e só criam separação obrigatória contra hits comparáveis do mesmo mob/estado ou quando sua normalização conhecida demonstrar incompatibilidade, não por ausência do mesmo charm em outros mobs do componente.
- **S-009 — Cardinalidade:** partições incompatíveis com a cardinalidade mecânica são inválidas.
- **S-010 — Cooldown:** uma partição que exige dois AAs no mesmo ciclo é inválida.
- **S-011 — Resultado:** retornar somente componentes numerados, ainda sem nomes.

```text
holyOriginal(600) ∩ holyOriginal(1200) = vazio

Componente 1: ... 600
Componente 2: 1200
```

A falta de outra ação conhecida não permite juntar novamente esses componentes.

### Escolha da partição

Ordenar lexicograficamente:

1. Menor número de contradições mecânicas.
2. Maior cobertura por interseções determinísticas.
3. Maior cobertura física coerente.
4. Maior respeito às fronteiras obrigatórias.
5. Maior consistência de cardinalidade por leech, quando o setup de leech for conhecido ou inferível.
6. Menor quantidade de evidência desconhecida.
7. Menor quantidade de componentes redundantes.
8. Leech residual como desempate fraco, incluindo razão apenas em hits não-overkill.

A cardinalidade por leech em S-014/S-015 é mais forte que o uso genérico de leech como desempate, porque testa uma fórmula mecânica de área e arredondamento. Ela continua subordinada a contradições mecânicas, cooldown, topologia, casts concretos e interseções determinísticas disponíveis.

O sinal de alinhamento cast↔turno (proximidade entre o timestamp do cast e o
centro temporal de um bloco) **não é critério desta ordem** e não pode decidir
a escolha da partição contra a evidência de leech quando degenera — isto é,
quando o cast de uma spell ofensiva elemental de **área** e todos os hits do
turno caem no mesmo segundo, **sem ação ofensiva concorrente no turno** (sem
`Using` de runa, sem cast de granada com janela cobrindo o turno, uma única
incantação de ataque), tornando o alinhamento verdadeiro para qualquer ponto
de corte candidato e equivalente a maximizar o tamanho do bloco da ação. Nesse
caso o alinhamento é rebaixado a **último desempate**: a escolha segue os
critérios acima (em particular a consistência de cardinalidade por leech,
critério 5) e só recorre ao alinhamento em empate total — ele não é eliminado,
para não converter em ambíguo (S-013) um turno que ele ainda resolve. Este é o
mesmo princípio de V-024, estendido do eixo físico para a spell elemental de
área sem concorrência. Quando há ações ofensivas concorrentes (runa, granada,
mais de uma incantação), o alinhamento mantém sua posição — entre ações
diferentes ele carrega informação real (M-012/M-013). Granada (janela própria
`[cast+2, cast+4]`, M-023) e spells single-target (H-005) não são afetadas.
Caso-prova: `mazzerinbarrage 23:46:36` — o corte `A12 S12` com leech 24/24
exato não pode perder para `A11 S13` só porque o bloco de spell maior conta
mais hits no segundo do cast.

- **S-012 — Sem pontuação somada:** evidência fraca não compensa contradição mecânica.
- **S-013 — Sem fallback legado:** sem partição válida, o resultado permanece explicitamente não resolvido.
- **S-014 — Cardinalidade por leech:** quando o setup de leech for conhecido ou inferível, cada bloco contíguo candidato deve ser validado pela cardinalidade de leech. Se um bloco possui `k` hits principais elegíveis, esse bloco só é mecanicamente válido se todos os hits principais do bloco aceitarem `N_leech = k` por D-024 ou por reconstrução de overkill em D-025. O leech não nomeia o componente, mas informa quantos hits principais o componente deveria conter.

```text
Exemplo obrigatório:
[h1 night harpy 326, h2 night harpy 355] no mesmo componente
=> k = 2 hits principais elegíveis
=> N_leech = 2
=> areaFactor(2) = 0.55

Não usar N_leech = 1 apenas porque o nome do mob é o mesmo.
```

- **S-014a — Proibição de N por mob distinto na segmentação:** é proibido interpretar `N_leech` como quantidade de mobs distintos, nomes únicos de mob ou alvos únicos. Se um bloco possui `k` hits principais elegíveis, o teste de leech do bloco usa `N_leech = k`, mesmo quando os `k` hits possuem o mesmo mob alvo. Uma revisão que rejeite uma partição com o argumento “os hits são no mesmo mob, então N = 1” viola esta regra.

- **S-014b — Topologia não redefine N_leech:** a topologia da ação, como single-target ou área, não altera a definição de `N_leech`. Se uma hipótese de componente contém `k` hits principais elegíveis, o teste de leech desse bloco usa `N_leech = k`. A topologia pode invalidar uma hipótese por outras regras, mas não pode transformar `N_leech` em quantidade de mobs distintos.

- **S-014c — Cardinalidade por leech não tem gate de tamanho mínimo:** o teste geral de cardinalidade por leech deve avaliar partições de qualquer turno com pelo menos dois hits principais elegíveis. É proibido exigir `hits.length >= 3` para a análise geral de partições. O refinamento específico de “AA single-target como outlier fora de um cluster de área” pode exigir `>= 3` hits (precisa de bloco com `>= 2` para medir coesão), mas essa exigência é só daquele refinamento; ela não pode bloquear a comparação geral de partições. Para um turno de dois hits `[h0, h1]`, o classificador deve comparar explicitamente, no mínimo:

```text
Hipótese A: [h0, h1] = um componente, N_leech = 2, areaFactor(2) = 0.55
Hipótese B: [h0] N_leech = 1  +  [h1] N_leech = 1
```

A escolha entre A e B usa vida e mana separadamente (D-022), reconstrução de dano real sob overkill (D-025) e o encaixe do dano exibido nos intervalos reconstruídos. Quando nenhuma hipótese se prova mais forte — empate de encaixes ou um hit cujos canais de vida e mana não reconciliam num mesmo `Dreal` nem com o bônus máximo de minor charm permitido (D-021/D-022) — o resultado é registrado como **ambíguo/não resolvido de forma explícita** (S-013), nunca apresentado como partição determinística.

- **S-014d — Anomalia de leech deve ser demonstrada mecanicamente:** quando um hit apresenta um canal (vida ou mana) muito acima do esperado, não basta atribuir a um minor charm sem prova. `Void’s Call` adiciona no máximo +0,8%, +1,2% ou +1,6% de Mana Leech, e `Vampiric Embrace` no máximo +1,6%, +2,4% ou +3,2% de Life Leech (D-021). A hipótese de charm só é válida se o bônus permitido fizer os `Dreal` de vida e mana voltarem a intersectar. Como cada charm é por mob e exclusivo (somente um mob tem cada bônus, D-021), um charm já comprovado em outro mob não pode ser reusado para explicar a anomalia. Se nem o bônus máximo permitido reconcilia os canais, a anomalia não é explicada por charm: o canal anômalo é descartado como evidência e, se for o sinal decisivo da partição, o turno é ambíguo.

- **S-014e — N_leech é o maior N sem contradição; virtual-zero só até lá e só com kill real:** o `N_leech` de um bloco é o **maior** `N` em que **todos** os hits principais visíveis permanecem consistentes (observado ≤ esperado por D-023; *capped-low*, isto é, observado abaixo do esperado por cap de HP, é consistente e nunca é contradição — V-014/D-025). É **proibido** adicionar hit virtual (invisível, dano 0) para forçar `N` além desse ponto, porque `N` maior reduz `areaFactor(N)` e transforma o *capped-low* consistente em **contradição** (observado > esperado). Um bloco holy determinístico cujos `k` hits visíveis já são o maior `N` consistente (`N=k` consistente, `N=k+1` contradito) **fecha em `N=k`**, sem virtual. Hits virtuais só são válidos quando `N>k` é ele próprio consistente **e** há evidência de que um charm/proc **matou** o alvo (overkill/kill) antes do dano principal aparecer — a mera existência de um proc de charm de dano no turno **não** basta (C-008). O teste de `N>k` precisa ocorrer **antes** da escolha final entre partições, mesmo quando `N=k` já é consistente; depois da escolha, o hit virtual só pode ser anexado ao bloco cuja própria cardinalidade mecânica `N>k` foi aceita. Caso-prova espúrio: `mk 05:43:59` — granada com 8 hits visíveis; N=8 consistente (esperado 118 ≥ 114 observado) e N=10 **contradito** (esperado 106 < 114); os 2 hits virtuais atribuídos a `curse`/`wound charm` (procs que não matam) são inválidos ⇒ `N_leech = 8`. Guardas legítimas: `darklight e vemiath 22:20:24` — N=7 consistente > 6 visíveis, com `enflame charm` que matou o alvo ⇒ A6 visível + A0 virtual (N_leech=7); `monk 2 07:20:18` — a Flurry com `612` visível + skirmisher morto por `enflame charm` fecha `N=2`, enquanto a hipótese fundida exigiria `N=3` e não fecha ⇒ A1 + Flurry 2, com o virtual de dano zero na Flurry.

  Quando o kill real por charm precede o bloco visível de uma ação concreta de
  área ordinária em turno de AA exclusivamente single-target (M-031/M-032), a
  propriedade do virtual também deve respeitar a cardinalidade. Se os `k` hits
  visíveis da ação fecham em `N=k` e `N=k+1` é contradito, o virtual **não**
  pertence à ação. Se não há AA visível no turno, esse kill observado constitui
  o único AA do ciclo como hit virtual de dano zero, antes da ação: `A1 virtual
  + ação(k)`. Se a própria ação aceita `N=k+1`, o virtual permanece nela; se já
  existe AA visível, M-032 impede criar um segundo AA. Caso-prova: `uhax 3` S0
  `20:54:20` — Poison Charm mata um walking pillar antes dos 12 hits visíveis de
  Wrath of Nature; Wrath fecha em `N=12` e contradiz `N=13` ⇒ `A1 virtual +
  Wrath of Nature 12`, nunca `A0 S13` nem `A0 S12`.

  O `k+1` acima descreve o caso de **um** charm-kill. O critério real é "a ação
  aceita algum `N` acima dos hits visíveis": com dois ou mais charm-kills no
  bloco, a ação pode aceitar `k+2`, `k+3`… e continua sendo dona de **todos**
  eles. O teste DEVE varrer de `k+1` até `k + (quantidade de charm-kills
  elegíveis do bloco)`, e o AA virtual só é criado quando algum `N` testado é
  utilizável e **nenhum** é aceito. Testar apenas `k+1` num turno com dois kills
  cria um AA virtual espúrio que conta o mesmo kill duas vezes — uma no AA e
  outra na ação — violando M-025. Caso-prova: `uhax 3` S1 `13:33:46` — enflame
  mata um darklight matter antes do bloco e poison charm mata um walking pillar
  dentro dele; Wrath tem 8 hits visíveis e aceita `N=10` ⇒ `A0 + Wrath of
  Nature 10` (8 visíveis + 2 virtuais), nunca `A1 S10` nem `A1 S9`.

  **Divergência de um único canal não é contradição.** Ao decidir o maior `N`
  consistente, vale D-024 literalmente: o hit aceita `N` quando vida **e/ou**
  mana fecha. Em `uhax 3` S1 `13:33:46` a mana de `darklight matter` fica 1
  acima do esperado em `N=10` (53 contra 52), enquanto a vida fecha **exata nos
  8 hits**; o turno fecha `N=10`. Tratar aquele `+1` de mana como contradição
  dura levou, durante a investigação, ao alvo errado `A1 + S9`.

  Quando a propriedade temporal é determinada por uma fronteira explícita
  `AA -> Using -> runa` de M-018a, um charm-kill real observado depois do
  `Using` e dentro do run contíguo da runa pertence à própria runa. Nesse caso,
  o fato estrutural do kill MUST ser preservado como hit virtual da runa mesmo
  quando a validação plana de `N=k+1` fica inconclusiva ou contradita apenas
  pela dispersão cross-mob já neutralizada por V-015d; a falha do modelo de
  leech não pode apagar um hit cuja ação proprietária é conhecida por ordem.
  Esta exceção exige simultaneamente o `Using` entre AA e runa e o kill real
  seguido de XP; um proc sem kill continua proibido por C-008. Caso-prova:
  `uhax 3` S1 `13:33:17` — overflux mata um darklight striker depois do
  `Using` de Great Fireball ⇒ `A1 + R10` (9 visíveis + 1 virtual).

  A mesma fronteira é simétrica para hit virtual anterior. Quando não há AA
  visível, mas existe exatamente um charm-kill real seguido de XP antes do
  `Using`, ele ocupa o único AA virtual permitido por M-031/M-032; charm-kills
  posteriores continuam na runa. A cardinalidade plana não pode mover o
  virtual anterior através do `Using` nem apagar o posterior. Caso-prova:
  `uhax 3` S1 `13:33:44` — enflame mata darklight matter antes do `Using`, e
  overflux mata darklight striker depois ⇒ `A1 virtual + R8` (7 visíveis + 1
  virtual pós-`Using`).

- **S-015 — Dano parecido com cardinalidade distinta:** quando dois componentes possuem magnitudes de dano semelhantes, ou quando o overkill torna as magnitudes exibidas pouco confiáveis, a segmentação não deve depender apenas de médias ou clusters de dano exibido. Nesses casos, a cardinalidade por leech deve ser usada para decidir quantos hits procurar em cada componente. Um bloco com dano parecido só pode ser fundido se a cardinalidade por leech aceitar o tamanho fundido; se a fusão exigir `N_leech` incompatível com os hits, uma fronteira deve ser mantida.

- **S-016 — Limite do leech:** a cardinalidade por leech é evidência mecânica de tamanho de bloco, não autorização para violar ordem, cooldown, topologia ou casts concretos. O leech pode escolher entre partições mecanicamente possíveis, mas não pode criar segundo AA no mesmo ciclo, não pode permitir spell e runa no mesmo turno, não pode dar múltiplos hits a uma ação cujo perfil permita apenas um hit, não pode reutilizar cast e não pode inventar componente sem hit observado.

- **S-017 — Cardinalidade por leech quando originais físicos estão indisponíveis:** quando originais físicos, armor, mitigation ou physicalDmgMod estiverem ausentes (inclusive no regime pós-16 de junho de 2026, D-016/D-028), o classificador **não deve** colapsar automaticamente blocos físicos parecidos em um único componente. Nesses casos, deve testar partições contíguas por cardinalidade de leech. Para cada bloco candidato com `k` hits principais elegíveis, testar `N_leech = k`. A ausência do eixo físico reduz a evidência disponível, mas **não desativa** a evidência de leech. Um bloco único de `k` hits só pode ser aceito se seus hits aceitarem `N_leech = k` pelo leech utilizável; uma partição alternativa em blocos menores, cujos hits aceitem com mais consistência seus respectivos `N_leech`, **deve vencer**, mesmo sem O-interval físico. Uma partição única só vence se aceitar o `N_leech` do bloco único melhor que as partições alternativas. É proibido aceitar o bloco único apenas por falta de O-interval físico ou por o regime ser pós-corte.

```text
Caso obrigatório — barrage 18:59:47 (sessão 16/Jun/2026, pós-corte, sem mob mods físicos):
  Hipótese A (bloco único):  [17 hits] = 1 componente
                              N_leech = 17, areaFactor(17) = 0.1 + 0.9/17 ≈ 0.1529
  Hipótese B (partição):     [8 hits] N_leech = 8, areaFactor(8)  = 0.1 + 0.9/8 = 0.2125
                              [9 hits] N_leech = 9, areaFactor(9)  = 0.1 + 0.9/9 ≈ 0.2000
  Esperado: A8 S9 (AA primeiro), porque a partição 8+9 respeita melhor o N_leech por bloco
  que o bloco único de 17. Ausência de armor/mitigation/physicalDmgMod não justifica S17.
```

- **S-018 — Fronteira geral por leech em todos os resolvedores:** a consistência de leech (cardinalidade por `N_leech` e consistência de canal de vida/mana) é uma evidência **geral** de segmentação, não uma regra específica de Ethereal Barrage. Todo resolvedor experimental que avalia partições de turno deve aplicar a validação por leech quando houver leech utilizável. Um bloco único de spell, runa, granada ou AA de área só pode ser aceito se seus hits aceitarem a cardinalidade por leech do bloco; se uma partição contígua alternativa apresentar melhor consistência de leech por bloco, ela deve vencer, respeitando as demais regras mecânicas (S-016: o leech nunca viola ordem, cooldown, topologia ou casts concretos, nem cria segundo AA fora de RP — M-031/M-032). A fronteira geral por leech roda **antes** de aceitar qualquer bloco único grande como componente, e é subordinada à evidência determinística disponível (S-016): só assume quando os originais físicos/elementais estão silenciosos (D-028).

  ```text
  Caso obrigatório — barrage 19:00:15 (sessão 16/Jun/2026, pós-corte, sem mob mods):
    cast = exevo mas san (Divine Caldera), sem cast exori dir moe.
    Hipótese A (bloco único):  [11 hits] = 1 spell  => A0 S11  (ERRADO)
    Hipótese B (fronteira por life-leech onset):
      [hits 0–4]  AA de área   life-leech = 0       => A5
      [hits 5–10] Divine Caldera life-leech ~165 (cap zera os 2 últimos) => S6
    Esperado: A5 S6. O mesmo mob (roaming dread) aparece nos dois blocos com
    life-leech diferente, o que reforça a fronteira (D-024a/D-029). Ausência de
    mob mods pós-corte NÃO autoriza colapsar o turno em S11.
  ```

- **S-019 — Ausência de originais não desativa leech:** a ausência de originais físicos, elementais, armor, mitigation ou mob mods pós-corte (D-016/D-028) não desativa a análise por leech. Quando esses eixos estiverem indisponíveis, a consistência de leech (cardinalidade `N_leech` e canal de vida/mana) deve ser usada como evidência **independente** para evitar fusões indevidas de componentes. É proibido aceitar um bloco único apenas por falta de O-interval físico ou por o regime ser pós-corte; é proibido usar a ausência de mob mods como justificativa para pular a análise de leech.

- **S-020 — Bracketing same-mob por leech absoluto, último desempate antes de declarar ambíguo:** quando os dois melhores candidatos empatam em **todos** os critérios 1–8 acima e diferem por exatamente um hit num `shape` de 2 componentes (o gatilho que hoje produz `unresolved/ambiguous_equal_best_partitions`, S-013), rodar um desempate adicional antes de desistir. O hit que muda de componente entre os dois candidatos costuma ser overkill: seu dano exibido é truncado (não confiável para razão leech/dano), mas o **valor absoluto do leech observado continua válido** (não foi capado por HP/mana cheios). Buscar, no turno, a instância do **mesmo mob** mais próxima antes desse hit e a mais próxima depois (a âncora pode ser overkill também — overkill invalida a razão leech/dano da âncora, não o valor absoluto de leech dela; preferir âncora no mesmo estado de Expose Weakness quando existir). Comparar, em cada canal disponível do hit em disputa (vida e/ou mana), a distância absoluta até cada âncora; o candidato vencedor só é aceito se **todos** os canais disponíveis concordarem sobre qual âncora está mais perto. Sem âncora do mesmo mob dos dois lados, com canais discordando entre si, ou com disputa de mais de um hit / `shape` de 3+ componentes, o turno permanece `unresolved/ambiguous_equal_best_partitions` (S-013) exatamente como antes.

```text
Caso-prova obrigatório — mazzerinbarrage 23:47:17 (sessão salva 30/Jun/2026):
  Candidatos empatados: arrow>spell cuts=[7,16] vs cuts=[8,16] (16 hits, cast
  exori dir moe = Ethereal Barrage)
  Hit em disputa (walking pillar, seq 2477, overkill, dano exibido 156):
    life=126, mana=34
  Âncora do mesmo mob ANTES (seq 2463, prey+EW): life=120
  Âncora do mesmo mob DEPOIS (seq 2496, prey):    life=125, mana=34
  Vida: |126-120|=6 > |126-125|=1  => vota DEPOIS
  Mana: âncora antes=37..39, âncora depois=34   => |34-34|=0 vota DEPOIS
  Sem contradição entre canais => cuts=[7,16] vence (AA=7, Barrage=9)
```

- **S-020a — Fallback por núcleo estável de leech absoluto quando falta âncora same-mob:** se S-020 não decidir porque falta âncora do mesmo mob em um dos lados, mas os dois candidatos continuam empatados em todos os critérios 1–8, possuem o mesmo `shape` de 2 componentes e diferem por exatamente um hit, o classificador pode comparar o hit em disputa contra os núcleos estáveis dos candidatos. O núcleo estável anterior é o conjunto de hits principais que permanecem no primeiro componente nos dois candidatos; o núcleo estável posterior é o conjunto de hits principais que permanecem no segundo componente nos dois candidatos. Para cada canal disponível no hit em disputa (vida e/ou mana), comparar o valor absoluto de leech do hit contra a menor distância absoluta até qualquer valor utilizável do núcleo anterior e até qualquer valor utilizável do núcleo posterior. O candidato vencedor só é aceito se todos os canais que conseguem comparar os dois núcleos votarem no mesmo lado. Se faltar núcleo utilizável de um lado, houver empate de distância, canais discordarem, disputa de mais de um hit ou `shape` com 3+ componentes, o turno permanece `unresolved/ambiguous_equal_best_partitions` (S-013). Esta regra não usa razão `leech/dano` em overkill (D-019/D-026), não normaliza dano entre mobs e não introduz limiar numérico.

```text
Caso-prova obrigatório — mazzerinbarrage 22:09:57 (sessão salva 28/Jun/2026):
  Candidatos empatados: arrow>spell cuts=[2,5] vs cuts=[3,5] (5 hits, cast
  exori dir moe = Ethereal Barrage)
  Hit em disputa (darklight source, seq 3200, EW):
    life=157, mana=51
  Núcleo estável ANTES:
    bloodjaw life=147 mana=48
    darklight matter life=163 mana=58
  Núcleo estável DEPOIS:
    bloodjaw life=227 mana=61 overkill
    darklight source life=246 mana=66 overkill
  Vida: 157 está mais perto de 147/163 que de 227/246 => vota ANTES
  Mana: 51 está mais perto de 48/58 que de 61/66 => vota ANTES
  Sem contradição entre canais => cuts=[3,5] vence (AA=3, Barrage=2)
```

- **S-020b — Só canal discriminante vota; canal sem poder de resolução se abstém:** a
  exigência de unanimidade de S-020/S-020a vale entre os canais que são **evidência**, e um
  canal só é evidência quando consegue separar os dois lados. O leech observado é
  `CEIL(danoReal × taxa × areaFactor)` (D-023), então diferenças da ordem do arredondamento
  não distinguem nada. Um canal só vota quando a **margem** entre as duas distâncias
  comparadas — `| |leech − âncoraAntes| − |leech − âncoraDepois| |` em S-020, ou a mesma
  quantidade contra os núcleos estáveis em S-020a — excede a tolerância de valor de leech já
  usada pelo classificador para esse mesmo ruído. Canal cuja margem não supera essa tolerância
  é **evidência ausente** (D-006), não contradição: ele se abstém e **não** bloqueia a decisão
  dos demais. Empate exato de distância é o caso particular de margem zero, logo também é
  abstenção. Se **nenhum** canal for discriminante, o turno permanece
  `unresolved/ambiguous_equal_best_partitions` (S-013) — a regra nunca decide por ausência de
  evidência. Esta cláusula não introduz limiar novo: reusa a tolerância de leech já normativa
  do motor.

```text
Caso-prova obrigatório — gloompillar 08:36:51 (sessão 14/Jul/2026, Ethereal Barrage,
16 hits):
  Candidatos empatados: arrow>spell cuts=[8,16] vs cuts=[9,16]
  Hit em disputa (darklight emitter, seq 5594): life=100, mana=27
  Âncoras do mesmo mob: ANTES (seq 5576) life=80 mana=26
                        DEPOIS (seq 5600) life=104 mana=29
  Vida:  |100-80|=20 vs |100-104|=4   => margem |20-4| = 16  => DISCRIMINANTE, vota DEPOIS
  Mana:  |27-26|=1   vs |27-29|=2     => margem |1-2|  = 1   => NÃO discriminante, abstém
  Resultado: cuts=[8,16] vence (AA=8, Barrage=8).
  Corroboração independente (S-018/D-029): o life-leech salta 85→100 exatamente no
  índice 8 — a mesma fronteira. A mana do turno inteiro vive entre 26 e 30.
```

### Homogeneidade determinística de componentes

- **H-001 — Homogeneidade determinística de componentes elementais não-overkill:** todo componente classificado como spell, runa ou granada elemental/mágica de área deve ser mecanicamente homogêneo quando seus hits forem não-overkill. Um cast concreto não é suficiente para absorver todos os hits do turno. O componente só pode receber hits que sejam compatíveis com o mesmo bloco determinístico, considerando elemento, crit-state, prey, mob mods disponíveis, topologia, timing e leech-cardinality. Se hits não-overkill atribuídos ao mesmo componente se separam em clusters incompatíveis por dano, leech ou cardinalidade, o componente único deve ser rejeitado e o classificador deve testar partições contíguas alternativas. A razão de leech `(vida + mana) / dano` de um componente de área é `leechBase × areaFactor(N_leech)` (D-023): um único componente tem `N_leech` fixo, logo uma única razão; dois blocos contíguos com `N_leech` distinto produzem **níveis de razão distintos**, e esse salto é a fronteira (bidirecional: o AA, atingindo menos alvos, tem razão **maior** — a razão pode cair através da fronteira).

- **H-002 — Cast concreto não vence contra contradição mecânica:** a existência de uma incantação ofensiva concreta é necessária para nomear uma spell, mas não é suficiente para classificar todos os hits do turno como aquela spell. Se o bloco único de spell exige dano/leech/cardinalidade incompatível, o bloco único deve ser rejeitado mesmo havendo cast concreto.

- **H-003 — Invariante de bloco único grande:** todo componente único com 3 ou mais hits principais elegíveis e leech utilizável deve provar que aceita `N_leech = k`, onde `k` é a quantidade de hits principais elegíveis do componente. Se `N_leech = k` não fecha, ou se uma partição contígua alternativa fecha melhor por leech-cardinality, o componente único deve ser rejeitado.

- **H-004 — Homogeneidade e leech são globais:** as regras de homogeneidade determinística e cardinalidade por leech se aplicam a qualquer vocação, qualquer spell, qualquer runa, qualquer granada, qualquer AA de área, qualquer componente e qualquer regime de mob mods. Elas não são regras específicas de Ethereal Barrage. Reforço (D-024a/S-014a/S-014b): `N_leech` é a quantidade de hits principais elegíveis do componente — **não** é quantidade de mobs distintos, nomes únicos de mob, alvos ou criaturas diferentes. Reforço (D-028/S-019): a ausência de armor, mitigation, physicalDmgMod, elementalDmgMod ou mob mods pós-corte **não desativa** a análise de leech-cardinality; quando os mods pós-corte estiverem ausentes, o classificador deve ficar **mais** dependente de leech, timing, ordem e homogeneidade observável — não menos.

  ```text
  Caso obrigatório — barrage 19:00:24 (sessão 16/Jun/2026, pós-corte, sem mob mods):
    cast = exevo mas san (Divine Caldera), sem cast exori dir moe.
    Diferente de 19:00:15, AQUI o AA TEM life-leech (o jogador não está com vida
    cheia), então a fronteira por onset (S-018) NÃO dispara.
    Hits não-overkill, em dois blocos contíguos claros:
      bloco 1 (AA de área):       1030, 1006, 992, 1001   razão ~0.276 (N_leech = 4)
      bloco 2 (Divine Caldera):   720, 720, 720, 920, 717, 920, 720  razão ~0.18 (N_leech = 7)
    Hipótese ERRADA: [11 hits] = 1 spell => A0 S11. Rejeitar: as razões de leech
      formam DOIS níveis (0.276 vs 0.18), logo o bloco não é homogêneo (H-001), e o
      cast concreto de exevo mas san NÃO autoriza absorver os 11 hits (H-002).
    Hipótese CORRETA: A4 S7 (AA primeiro, ordem AA→spell). NÃO aceitar S4 A7
      (violaria a ordem normativa). O mesmo mob (roaming dread) aparece nos dois
      blocos com razão de leech diferente, o que reforça a fronteira (D-024a/D-029).
  ```

- **H-005 — A ordem AA→spell desempata, não cria AA fantasma (converso de H-001/H-002):**
  o prior estrutural "AA primeiro" só pode **separar** um prefixo `arrow` de um bloco
  elemental quando há **evidência positiva** de AA na fronteira. São evidências positivas:
  (a) separação de timing — o hit de AA cai num segundo estritamente anterior ao bloco
  elemental; (b) crit-state distinto na fronteira (D-007/S-008); (c) dano original distinto
  — unir o prefixo ao bloco elemental quebra a interseção homogênea (H-001); ou (d) salto de
  razão de leech `(vida+mana)/dano` entre o prefixo e o bloco (D-023/H-001, o AA tem razão
  **maior**). Quando o bloco é **homogêneo** — mesmo original elemental exato, mesmo
  crit-state, mesmo segundo, e a cardinalidade por leech aceita `N_leech = total` —, a ordem
  AA→spell **não** autoriza separar um AA fantasma só porque a partição `arrow → spell` é
  tecnicamente válida (um prefixo de um único hit é trivialmente válido). O prior é
  **desempate em ambiguidade genuína**, nunca um veto que sobreponha evidência positiva
  convergente. Esta é a simétrica de H-002: assim como o cast concreto não autoriza **fundir**
  hits incompatíveis, a ordem AA→spell não autoriza **separar** um bloco homogêneo. Para bloco
  seguinte **físico** (ex.: Ethereal Barrage, `exori dir moe`), onde AA e spell são ambos
  físicos e indistinguíveis por original elemental, o prior AA-first é preservado (a separação
  vem do eixo físico/timing/leech, não desta regra).

  ```text
  Caso obrigatório — barrage 19:01:55 (cast exevo mas san, Divine Caldera):
    9 hits no segundo :55, todos não-overkill:
      crypt mage 668, cyclursus 857 (×5), roaming dread 672 (×3)   [fora hits de charm]
    Todos os sinais convergem para S9 (componente único de Caldera):
      - timing: 9 hits no mesmo segundo :55, sem hit ~1s antes;
      - crit-state: uniforme não-crítico (os críticos são :57, outro turno);
      - dano original holy: homogêneo ~703 (668→703, 672→703, 857→~702);
      - leech-cardinality: N=1 rejeitado em todos; o bloco fecha em N_leech = 9.
    Hipótese ERRADA: A1 S8 (separa o crypt mage 668 como AA fantasma) — vencedora
      apenas pela precedência do prior AA-first, sem evidência positiva. REJEITAR.
    Hipótese CORRETA: A0 S9.
  ```

### Fase 2 — Nomear

- **N-001 — Segmentação imutável:** nomear não pode remover ou mover fronteiras.
- **N-002 — AA:** verificar coerência física, posição e cooldown.
- **N-003 — Spell:** verificar spell ofensiva concreta compatível.
- **N-004 — Granada:** verificar cast anterior e impacto único entre cast+2 e cast+4.
- **N-005 — Runa:** verificar runa não conflitante e compatível com seu perfil.
- **N-006 — Não resolvido:** sem evidência suficiente, usar `unresolved_component_N`.
- **N-007 — Uma ação por componente:** um componente recebe no máximo uma ação.
- **N-008 — Um componente por ação:** uma ação nomeia no máximo um componente.
  - **N-008a — A exclusividade é cross-turno e vale para as três naturezas de ação:** uma ação consolidada num turno resolvido não é mais oferecida a nenhum outro turno. Isso já valia para granada (M-025, janela `[cast+2, cast+4]`), mas a janela de spell (`[impacto-1, impacto+1]`, M-012/M-013) e a fronteira `Using` de runa (M-017/M-018a) cruzam a fronteira provisória de 2 s (T-002) do mesmo jeito, e sem a exclusividade o turno seguinte reivindica a mesma ação. O consumo é por varredura e em ordem cronológica; passes de sondagem que resolvem turnos isolados ou fora de ordem não consomem nada. Casos-prova: `uhax 3 ed` `03/Jul/2026` `13:43:53`/`13:43:55` — existe **um** `exevo ulus tera` (`:54`) e ele pertence a `:53`; o bloco de `:56` é a runa Great Fireball da `Using` de `13:43:56`, cuja assinatura por-mob normalizada (`1 : 1,0033 : 0,923 : 0,803`) é a dos blocos GFB de `:58` e `13:44:07`, não a do Terra Burst de `:53` (`1 : 1,047 : 1,001`). E `bakra`/`jaded` `10/Jun/2026` `09:29:22`/`09:29:24` — `Divine Caldera` é de área e atinge cada mob **uma vez** por cast, então o `exevo mas san` de `:23` não pode explicar `733` e `565` no **mesmo** `bakragore`: o hit de `:24` é auto-ataque.
- **N-009 — Nome concreto:** spell, runa e granada devem carregar nome ou incantação concreta.
- **N-010 — Token genérico:** `spell`, `rune` ou `grenade` sem `actionLabel` não é saída pública válida.
- **N-011 — Exclusividade:** nomear um componente como spell impede qualquer componente do mesmo turno de ser nomeado como runa, e vice-versa.


**Regra normativa curta de N_leech:** em todas as fórmulas de leech deste classificador, `N_leech` significa a quantidade de hits principais elegíveis do componente. `N_leech` nunca significa quantidade de mobs distintos. `N_leech` **não depende de armor, mitigation ou physicalDmgMod** (D-028): a indisponibilidade desses dados não altera a contagem de hits principais nem desativa o teste de `areaFactor(N_leech)`. Se um componente possui dois hits no mesmo mob, então `N_leech = 2`. Se possui quatro hits em dois mobs, então `N_leech = 4`. `damage reflection`, `wound charm`, `overpower charm` e procs anexos não incrementam `N_leech`.

## 6. Regras por regime

### RP em pack

- **V-001:** usar originais físicos para AA e Ethereal Barrage e originais holy/elementais para spell, runa e granada.
- **V-002:** variação física de AA entre mobs não cria novos componentes quando os intervalos ainda intersectam.
- **V-003:** spell ou runa podem coexistir com granada no mesmo turno, mas runa e spell não podem coexistir no mesmo turno.
- **V-004:** all-arrow com cast próximo não vira automaticamente all-spell.
- **V-005:** prefixo fisicamente coerente permanece AA mesmo quando o sufixo é spell.

### Boss e alvo único

- **V-006:** cada ação concreta produz no máximo um hit no boss.
- **V-007:** dois hits no mesmo timestamp podem ser AA → spell, nunca dois hits da mesma ação single-target.
- **V-008:** um terceiro hit compatível com granada pode formar AA → spell → granada.
- **V-009:** cooldown pode produzir turnos sem AA, como granada → spell.
- **V-010:** hit posterior não pode virar segundo AA por falta de outra ação conhecida.

### Knight, sorcerer, druid e monk — AA por posição + cardinalidade de leech

Estas quatro vocações compartilham a mesma topologia/cardinalidade de AA (M-031/M-032:
exclusivamente single-target, zero ou um hit de AA por turno). Quando o turno tem uma
ação ofensiva concreta alinhada — um cast de spell (`nearestSpellCastForTurn`,
`actions.spellCasts`) ou, na ausência de spell compatível, uma runa (`actions.runeUses`,
sinal `Using one of N ... runes`, M-017) —, o classificador decide o corte AA×componente
por posição do primeiro hit e cardinalidade de leech — **sem** exigir coerência de origem
física ou elemental entre os hits do bloco resultante (diferente do Eixo 2-físico do RP,
que exige essa coerência por ser a única vocação com AA de área). Esta seção era descrita
só para EK (Knight); generalizada por `generalize-single-target-aa-resolver` após medir o
mesmo mecanismo em pack fights de Monk (`logs/serverlog6..9.txt`), e estendida de spell
para runa por `generalize-single-target-aa-resolver-to-runes` — spell continua tendo
prioridade sobre runa quando ambas forem candidatas (T-006/M-019 já impedem as duas
coexistirem no mesmo turno; nenhum fixture real exercita esse empate). Runa continua
sujeita à sua própria cardinalidade de nomeação: runa single-target (Sudden Death, Icicle,
Holy Missile) recebe no máximo um hit por turno mesmo dentro deste caminho (M-033) — o
corte por posição/leech decide onde a fronteira cai, não autoriza mais de um hit numa
runa single-target.

- **V-011:** posição do primeiro hit é evidência primária de AA.
- **V-012:** fronteira de crit-state é confirmação forte.
- **V-013:** leech é confirmação ou contradição secundária.
- **V-014:** overkill nunca cria contradição de leech.
- **V-015:** evidência inconclusiva gera diagnóstico; não apaga silenciosamente o AA posicional.
- **V-015a — Cardinalidade de leech como fronteira sob overkill:** em um turno dominado por overkill no qual nem originais elementais/físicos nem razão de leech conseguem formar fronteira confiável, a cardinalidade por leech (S-014/S-015) é sinal de fronteira primário. O classificador deve testar partições contíguas e validar se cada bloco de `k` hits principais elegíveis aceita `N_leech = k` pelo leech absoluto e pela reconstrução de dano real. O caso de AA single-target como outlier é apenas uma manifestação comum dessa regra, não a única. É proibido colapsar o turno inteiro em spell por ausência de originais quando o leech absoluto sustenta uma partição menor.
- **V-015b — O bloco de spell não é validado por origem física/elemental comum:** para as quatro vocações desta seção, o bloco de spell resultante do corte por posição/leech NÃO deve ser rejeitado por ausência de intersecção física (`physical_intersection_empty`) ou por dispersão elemental entre mobs distintos (`elemental_cluster_span_too_wide`) — **`same_mob_state_exact_original_mismatch` não pertence a esta lista**: ele compara hits do MESMO mob no MESMO estado, não mobs distintos, e continua sendo o veto duro de S-004a, isento apenas por mecânica declarada de múltiplos níveis por-mob (S-004a). A versão anterior desta regra o listava aqui, contradizendo S-004a; a exatidão same-mob permanece veto duro, e o conserto dos blocos que hoje dependem da isenção é agrupar por nível declarado, não afrouxar o veto — esses testes (S-007/V-001) são exigência exclusiva do Eixo 2-físico do RP (AA × Ethereal Barrage), não desta seção. Caso-prova: `serverlog6`/`localchat6` `07:10:55` (Monk, pack de raubritter) — 6 hits físicos contra 4 mobs distintos com dano decrescente (784, 735, 695, 715, 625, 618) e intervalos físicos revertidos disjuntos entre si; sem AA por cardinalidade/posição, o turno é um único bloco `spell` de 6 hits, e a ausência de origem física comum entre os mobs não é motivo de rejeição. Contra-exemplo que permanece válido pelo mesmo mecanismo mesmo quando a origem física dos hits **converge**: `serverlog6`/`localchat6` `07:10:57` — 1 AA (chastener, 558) + 9 hits de `exori mas amp pug` cujos intervalos físicos já se intersectam; o resultado não muda por ser decidido por posição/leech em vez de pela busca de partição genérica.
- **V-015c — `exori mas amp pug` (Monk):** incantation ausente de toda tabela de ações até `generalize-single-target-aa-resolver` (`js/unified-classification-engine.js` não a conhecia). Registrada com `element: physical`, `topology: area`, `vocation: monk`, confirmados pelo dano observado em todas as ocorrências de `logs/serverlog6..9.txt` (sempre físico, sempre 3+ mobs distintos no mesmo turno). Nome de exibição (`label`) deliberadamente **não** registrado — sem fonte confiável para o nome oficial da spell nesta ambiguidade; a exibição usa o fallback de texto (idêntico ao comportamento anterior ao registro).
- **V-015d — O bloco de runa também não é validado por origem física/elemental comum (extensão de V-015b para runa):** para as quatro vocações desta seção, quando a ação concreta do turno é uma runa (não spell), o bloco resultante do corte por posição/leech também NÃO deve ser rejeitado por `physical_intersection_empty` ou `elemental_cluster_span_too_wide` — a mesma razão de V-015b se aplica, agora ao caminho de runa. Caso-prova: `logs/uhax 3 server log ed.txt` + `logs/uhax 3 local chat ed.txt` (druid), sessão salva `Fri Jul 03 13:46:53 2026`, janela `13:33–13:42` — turnos de `Using one of N great fireball runes...` contra múltiplos mobs (darklight striker/matter/source, walking pillar), onde mobs com bônus Prey ativo revertem para um original elemental sistematicamente mais baixo que os demais hits do mesmo cast (achado à parte, não corrigido aqui: o `Bounty Talisman Effect` do `walking pillar` ainda não é lido pelo motor). Antes de `generalize-single-target-aa-resolver-to-runes`, isso levava 150 de 257 turnos da janela a `status=unresolved reason=no_valid_partition`; o mesmo log/vocação, na sessão salva `Tue Jun 30 21:02:55 2026` (janela `20:49–21:02`, sem bônus Prey na maioria dos turnos), já resolvia 219/350 turnos via componente rune — mostrando que a composição de mobs não era a causa, e sim a ausência do caminho de posição+leech para o eixo runa.

### Mage/druid

- **V-016:** AA de varinha pode ser intermitente e single-target.
- **V-017:** magnitude baixa isolada só indica AA quando também for física e temporalmente coerente.
- **V-018:** não é obrigatório haver AA em todo turno de área.
- **V-018a — AA mage/druid exige evidência positiva quando há ação concreta de área:** para
  sorcerer/druid, quando uma spell ou runa concreta de área pode explicar o bloco de hits
  observado, a posição do primeiro hit é apenas uma hipótese de AA, não confirmação. O split
  `AA + spell/runa` só deve vencer com evidência positiva independente que não dependa apenas da
  cardinalidade de leech do primeiro hit, como fronteira temporal limpa AA→ação concreta ou
  crit-state coerente com um hit single-target separado. Leech `capped_low`, ausência de leech,
  cardinalidade `N=1` isolada e uma partição que apenas reduz o número de contradições ao isolar
  o primeiro hit são evidência neutra neste perfil: não penalizam a hipótese de AA, mas também
  não podem confirmá-la sozinhas. Esses AAs neutros também não podem alimentar inferência global
  de `lifeBase`/`manaBase` como observações "golden" (C-006/C-007). Caso-prova:
  `logs/kim server log.txt` / `logs/kim local chat.txt`, sessão salva `14/Jul/2026 16:43:45`,
  turno `16:23:25`: dois hits idênticos `1307` em `sulphider` com o mesmo estado/leech pertencem
  ao componente concreto de área; nenhum deles deve ser classificado como AA.

### Ethereal Barrage

- **V-019:** AA e Ethereal Barrage são componentes físicos distintos.
- **V-020:** separar os blocos por timestamp, crit-state, intervalos físicos e leech, nessa ordem.
- **V-021:** intervalos físicos disjuntos criam fronteira mesmo quando as médias são próximas.
- **V-022:** leech só desempata quando os intervalos se sobrepõem.
- **V-023:** falso candidato a granada não pode quebrar um bloco físico coerente.
- **V-024:** o sinal de alinhamento cast↔turno (proximidade entre o timestamp do
  cast e o centro temporal de um bloco) não é nenhum dos quatro critérios de
  V-020 e não pode decidir a fronteira do bloco AA × Barrage quando degenera —
  isto é, quando o cast e todos os hits do bloco físico caem no mesmo segundo,
  tornando esse alinhamento verdadeiro para qualquer ponto de corte candidato e
  equivalente a maximizar o tamanho do bloco de Barrage. Nesse caso a fronteira
  segue V-020 (intervalo físico, depois leech) como se o sinal de alinhamento
  estivesse empatado entre os candidatos. Restrito a spells/runas físicos de
  área (topologia `area`); spells físicos single-target (ex. `exori gran con`,
  Strong Ethereal Spear) têm ordem AA→spell própria (H-005) e não são afetados.
- **V-025 — Componente único do eixo físico compete com cortes AA+spell por
  leech (extensão de S-017/S-018/S-019, H-001/H-003/H-004 ao eixo físico):** o
  prior estrutural "AA vem primeiro" (`mechanicalOrder`) não pode eliminar a
  hipótese de componente único (todo o turno como um só bloco de AA **ou** de
  spell/runa físico de área — não necessariamente Ethereal Barrage; qualquer
  spell/runa com `topology === 'area'` e `element === 'physical'`, ex.
  Greater Flurry of Blows `exori gran mas pug` do monge) antes de comparar
  leech contra os cortes AA→spell concorrentes. O componente único vence
  quando tem cardinalidade de leech (`N_leech`) perfeita — todos os hits
  principais elegíveis (mínimo 3, piso de H-003) aceitam `N_leech = n` em
  todos os canais utilizáveis, sem `capped_low` nem contradição — **e** todo
  corte AA→spell físico mecanicamente válido do mesmo turno é
  sistematicamente pior (leech `capped_low` em pelo menos um hit, para toda
  fronteira testada). Fora desse cenário, `mechanicalOrder` decide como antes
  entre os cortes AA→spell.

  ```text
  Caso obrigatório — mazzerinbarrage 17/Jun/2026 16:23:53 (Ethereal Barrage,
  6 hits críticos no mesmo segundo do cast `exori dir moe`):
    Hipótese A (componente único): spell[6] fecha N_leech=6 exato — delta 0 em
      vida e mana nos 6 hits, com o bônus de +10% vida da própria Ethereal
      Barrage (rate vida 0.6, mana 0.16).
    Hipótese B (cortes AA+Barrage): [2,6]/[3,6]/[4,6], todos mecanicamente
      válidos, todos cappedLowHits=6 (leech sistematicamente abaixo do
      esperado, qualquer que seja a fronteira).
    Esperado: A0 S6 (Ethereal Barrage). Sem V-025, mechanicalOrder=0 do
    componente único perde para mechanicalOrder=6 de qualquer corte, e o turno
    cai em unresolved/ambiguous_equal_best_partitions entre os cortes B (todos
    empatados entre si).

  Caso obrigatório — mazzerinbarrage 28/Jun/2026 22:07:44 (Ethereal Barrage,
  7 hits com Expose Weakness misto): mesmo padrão — componente único fecha
  leech limpo, cortes AA+Barrage não. Esperado A0 S7.

  Caso obrigatório — monk 11:55:23 (Greater Flurry of Blows `exori gran mas
  pug`, spell físico de área do monge, NÃO Ethereal Barrage): 4 hits (830,
  712, 830, 830) no mesmo segundo. O corte antigo (A1 S3, isolando o hit de
  712 como AA) tem leech contraditório: n=1 para o hit isolado prevê razão
  vida/dano ≈0.5 (rate base sem redução de área), mas a razão observada nos 4
  hits é uniforme ≈0.1627. O componente único (spell[4]) prevê razão
  0.5×areaFactor(4)=0.1625 — bate quase exato. Esperado A0 S4. Prova que V-025
  não é específica de paladin/Ethereal Barrage: qualquer spell físico de área
  está sujeito ao mesmo desempate por leech.
  ```

## 7. Agregação e métricas

- **A-001 — Resolvidos:** somente componentes nomeados entram na rotação.
- **A-002 — Não resolvidos:** permanecem no trace e diagnóstico, fora da rotação e uptime.
- **A-003 — Turno misto:** um componente não resolvido não apaga componentes resolvidos do mesmo turno.
- **A-004 — Execução sem dano:** tentativa confirmada pode contar para uptime sem receber hits.
- **A-005 — Dano observado:** linha `Using` é sinal forte (M-017), mas não inventa dano sem bloco determinístico compatível; onde há bloco compatível, confirma a runa com a precedência de M-018a.
- **A-006 — Dano base:** remover crit, Onslaught, prey e multiplicadores conhecidos.
- **A-007 — Dano efetivo:** usar o dano bruto observado.
- **A-008 — Overkill:** excluir das médias; usar como fallback apenas quando todos os hits da linha forem overkill.
- **A-009 — Turno parcial:** não penalizar uptime quando a borda removeu a evidência necessária. Turnos parciais classificáveis permanecem visíveis para inspeção e fora das penalizações de borda; turnos parciais não classificáveis por informação perdida permanecem diagnosticáveis quando pedidos diretamente, mas ficam fora da visualização operacional, métricas de rotação/uptime/AA perdido e contagem de turnos sem classificação.
- **A-010 — Linha por ação:** cada spell, runa e granada concreta possui sua própria linha.

## 8. Apresentação no classificador

- **U-001 — Rotação:** mostrar componente, turnos, hits médios, dano base e dano efetivo.
- **U-002 — Rótulos:** mostrar `Auto ataque`, spell com incantação, nome da runa ou nome da granada.
- **U-003 — Sem rótulo cru:** nunca mostrar apenas `spell`, `rune` ou `grenade`.
- **U-004 — Spells por turno:** um turno normal pode conter no máximo uma spell ofensiva. A única situação em que o trace pode apresentar mais de uma ação com natureza de spell é quando uma delas é a explosão atrasada de Divine Grenade, ligada a um cast de um turno anterior. Essa explosão continua rotulada e contabilizada como `grenade`, nunca como uma segunda `spell`.
- **U-005 — Não resolvido:** mostrar `Componente não resolvido N` e sua razão.
- **U-006 — Diagnóstico:** exibir dano, originais elementais, intervalo físico, leech, componente, ação e evidências.
- **U-007 — Gráficos:** criar séries a partir das ações reais da rotação.
- **U-008 — Componentes ausentes:** não inventar séries vazias de runa ou granada.
- **U-009 — Drill-down:** clique deve abrir exatamente o turno que originou o ponto.
- **U-010 — Histograma:** seleção deve usar a timeline da ação concreta.
- **U-011 — Low Blow:** apresentar como `crítico low blow` somente quando a linha observada tiver `low blow charm`.
- **U-011a — Savage Blow:** apresentar Savage Blow separadamente de Low Blow; uma linha com `savage blow charm` nunca deve aparecer como `crítico low blow`.
- **U-012 — Onslaught puro:** apresentar como `Onslaught`.
- **U-013 — Combinação:** apresentar como `Crítico e Onslaught`.
- **U-014 — Overkill:** manter visível e marcado.
- **U-015 — Diagnóstico obrigatório:** nenhuma falha pode ser escondida usando resultado legado.

## 9. Regras para implementação e revisão

Verificar que:

- nenhuma fronteira depende de `seed` ou label anterior;
- casts nomeiam componentes, mas não criam segmentação;
- originais incompatíveis nunca são fundidos;
- componentes unitários são aceitos;
- uma ação não é reutilizada;
- existe no máximo uma spell ofensiva normal por turno;
- spell e runa nunca coexistem no mesmo turno;
- spell ou runa podem coexistir com granada;
- cardinalidade e cooldown são respeitados;
- knight, druid, sorcerer e monk possuem zero ou um hit de AA por turno;
- somente RP pode possuir AA de área, sempre respeitando uma única instância de AA por ciclo;
- empate de dano entre AA single-target e spell usa leech por dano somente após as evidências anteriores e sem overkill;
- em turno dominado por overkill, a cardinalidade por leech separa blocos como `N = 1` e `N = k` sem usar razão `leech / danoMostrado`, inclusive quando originais holy estão indisponíveis — verificar `bastion 15:21:37` e `bastion 15:24:22`;
- originais elementais são reconstruídos por `CEIL(O × modEfetivo)`, `FLOOR` de mitigation e `FLOOR` dos multiplicadores pós-mitigação, nunca por divisão simples;
- originais físicos são reconstruídos por intervalo de armor roll (`armorLow..armorHigh`), nunca por média física de DPT;
- pierce, Expose Weakness e `active elemental amplification` alteram `modEfetivo` antes do `CEIL(O × modEfetivo)`, e não são bônus finais diretos;
- o setup de leech do personagem é combinação plausível de imbuements (até 2 slots), Conviction Perks (até 4 stacks) e perk de arma (até 4 stacks em mana, até 10 em vida), nunca percentual arbitrário;
- bônus de mob por leech usa somente `Vampiric Embrace` ou `Void’s Call`;
- no máximo um mob possui `Vampiric Embrace`;
- no máximo um mob possui `Void’s Call`;
- o mesmo mob nunca possui `Vampiric Embrace` e `Void’s Call` ao mesmo tempo;
- vida e mana são avaliadas separadamente antes de qualquer fallback por soma;
- a fórmula `areaFactor(N_leech) = 0,1 + 0,9 / N_leech` é usada para testar cardinalidade por quantidade de hits principais elegíveis;
- um bloco de `k` hits principais elegíveis só é aceito como componente se os hits aceitarem `N_leech = k` pelo leech, quando há leech utilizável;
- hits de overkill não usam razão `leech / danoMostrado`;
- em overkill, o classificador reconstrói intervalo de dano real por leech absoluto;
- charms como `wound`, `overpower` e `damage reflection` não contam como hits principais para o `N` do componente;
- em turnos com danos parecidos, o leech é usado para informar quantos hits procurar em cada componente antes de recorrer a fusões por média de dano;
- nenhuma implementação calcula `N_leech` por quantidade de mobs distintos, nomes únicos de mob ou alvos únicos;
- blocos com múltiplos hits no mesmo mob são testados com `N_leech = quantidade de hits principais elegíveis do bloco`;
- topologia single-target ou área não redefine `N_leech`; ela só pode validar ou invalidar a hipótese por regras próprias de topologia.
- runa single-target recebe no máximo um hit classificado por turno;
- `Using` é sinal primário (M-017), mas não inventa dano sem bloco determinístico compatível (M-018a);
- nenhuma saída pública usa rótulo genérico;
- `unresolved` permanece explícito;
- harness e UI usam a mesma classificação;
- mudanças são comprovadas por timing e magnitude;
- todos os turnos problemáticos permanecem documentados;
- `bakra/09:23:47` continua bloqueador enquanto não tiver explicação mecânica.

### Protocolo operacional de validação

Este protocolo não cria regra de classificação; ele determina como provar que uma
mudança respeitou as regras acima:

1. `tools/gabarito-unified.mjs` é a única porta prioritária de turnos curados. O
   conjunto atual tem 174 casos. Ele deve rodar antes de invariantes, dump completo
   ou testes amplos.
2. `tools/unified-invariants.mjs` verifica o corpus pre-cutoff usando os mesmos
   resultados canônicos já classificados no processo. Para M-024, dois timestamps
   de impacto só são válidos quando são consecutivos, pertencem ao mesmo turno e
   já foram consolidados pelo motor como rollover da mesma granada. M-025 continua
   proibindo o mesmo cast em turnos distintos.
3. `tools/dump-unified.mjs` registra todos os turnos de todas as sessões incluídas.
   As exclusões autorizadas são explícitas e canônicas: o par completo
   `Server Log drome.txt` e somente a sessão de `jaded Server Log.txt` salva em
   `09/Jun/2026 09:30:47`.
4. `--write-candidate` gera `dump-unified.txt`, `summary.json` e `manifest.json`
   sem alterar o último resultado aceito. `--promote-candidate` é uma operação
   separada, não classifica e só deve ocorrer depois da validação e da revisão do
   diff.
5. Perguntas sobre a quantidade ou a lista atual de turnos sem classificação usam
   `node tools/query-unified-dump.mjs [--list-unclassified]`. Essa consulta lê
   exclusivamente o `latest` promovido e nunca pode disparar uma nova
   classificação de forma implícita.
6. `tools/unified-experimental.mjs` é compatibilidade histórica temporária. Seus
   64 turnos ainda únicos estão inventariados por teste; casos novos entram apenas
   em `gabarito-unified.mjs`, e invariantes novas entram apenas em
   `unified-invariants.mjs`.


**Regra curta do leech:** o leech não existe para nomear o componente; ele existe para validar a cardinalidade do componente. Se um bloco tem `k` hits, o leech deve aceitar `N = k`. Quando o dano exibido está truncado por overkill, o leech reconstrói o dano real possível. Essa evidência é especialmente importante quando componentes diferentes possuem danos parecidos e a separação por magnitude não é suficiente.

## 10. Apêndice de casos-gabarito

Os casos abaixo são normativos. As contagens usam `A=arrow`, `S=spell`, `R=rune` e `G=grenade`. Para os logs brutos, consultar `tools/turnos-problematicos.md`; para inspecionar um turno, usar `node tools/diag-unified-turn.mjs "logs/<server>.txt" "logs/<local>.txt" HH:MM:SS [--session N]`.

| Caso | Logs e turno | Resultado obrigatório e evidência | Regressão impedida |
|---|---|---|---|
| 1 | highwin 2 `08:25:18` | `A13 R15 G13`. Granada holy ≈1028 em cast+4, AA físico variável e runa formam três blocos incompatíveis. | Fundir granada com AA ou runa. |
| 2 | highwin 2 `08:27:57` | `A9 S11 G8`. AA + Divine Caldera do cast `:57` + granada do cast `:55`. | Transferir a granada para o turno seguinte. |
| 2b | highwin 2 `08:27:59` | `A9`. Hits variáveis sem ação ofensiva compatível. | Inventar spell ou reutilizar a granada anterior. |
| 3 | highwin `08:47:16` | `A8 R12 G10`. Granada holy ≈980 e AA; a runa impacta no segundo seguinte. | Misturar impactos de timestamps diferentes. |
| 4 | mk `05:46:16` | `A5 R8`. A explosão real ocorreu em `:15`; o bloco de `:16` está no nível físico do AA. | Criar granada falsa em cast+4. |
| 5 | jaded `19:59:47` | `A9 S12 G9`. Caldera e granada são separadas por originais holy incompatíveis, embora ambas sejam críticas. | Fundir Caldera e granada por crit-state igual. |
| 6 | jaded `19:59:49` | `A9 S12`. AA físico espalhado + Caldera do cast `:50`. | Classificar AA como granada por proximidade temporal isolada. |
| 6b | jaded `19:49:59` | `A11 R12`. Os quatro `503` em roaming dread são fire determinístico (original 517) = great fireball, confirmado pela linha `Using great fireball` (M-017/M-018a); o AA do mesmo mob varia (473/492/513/528, físico). | Absorver o bloco determinístico da runa no AA porque o original físico de um hit coincide com o range do AA (D-005/V-002). |
| 7 | darklight RP `09:14:16` | `A2 S1`. Hits 405/501 são AA; 1067 é Strong Ethereal Spear. | Promover o turno inteiro para spell single-target. |
| 8 | Hakka `21:56:25` | `A1`, marcado `partialEdge`. Hit 504 pertence a uma ação cuja âncora ficou na sessão anterior. | Contar o corte de borda como AA perdido ou confirmado. |
| 9 | bastion `15:20:27` | `A1 S8`. Hit 517 é AA posicional; hit 15 é overkill e não participa do leech. | Remover o AA por contradição produzida por overkill. |
| 9b | bastion `15:24:22` | `A1 S4`. O hit 242 aceita `N_leech = 1` pelo leech e forma o AA. Os quatro hits de Executioner's Throw (`exori amp kor`) aceitam `N_leech = 4` quando o dano real é reconstruído pelo leech absoluto, mesmo com danos exibidos truncados por overkill. O `overpower charm` é proc extra e não conta no `N_leech` do componente. | Colapsar o turno em `S5` por danos exibidos parecidos ou por falta de razão de leech sob overkill. |
| 9c | bastion `15:21:37` | `A1 S4`. O hit 264 aceita `N_leech = 1` e os quatro hits de Executioner's Throw aceitam `N_leech = 4` pelo leech absoluto, com reconstrução de dano real sob overkill. A sessão é sem data → originais holy indisponíveis; nesse cenário, a cardinalidade por leech é a evidência mecânica principal para separar `A1 S4`. | Colapsar o turno em `S5` por faltarem, ao mesmo tempo, razão de leech e originais elementais. |
| 10 | bakra/Ichgahal `09:20:21` | `A1 S1 G1`; granada base ≈810 em cast+3. | Dar mais de um hit por ação no boss. |
| 11 | bakra/Ichgahal `09:21:06` | `A1 S1 G1`: AA 1169, Strong Ethereal Spear 1336 e granada ≈940. | Fundir spell e granada. |
| 12 | bakra/Ichgahal `09:23:47` | Alvo de integração bloqueado: a solução final precisa explicar mecanicamente `A1 S1 G1`, incluindo granada ≈917 em cast+4. | Aceitar o resultado apenas porque coincide com o legado. |
| 13 | bakra/Bakragore `09:33:47` | `A1 S1 G1`: AA 966, Strong Ethereal Spear 1175 e granada 885. | Escolher 677 como granada sem coerência de dano. |
| 13b | bakradrone/Ichgahal `09:52:47` | `A1 S1 G1`: AA 1447, Strong Ethereal Spear 1489 e granada 872. | Favorecer cast+3 sem evidência mecânica do hit. |
| 13c | bakradrone/Ichgahal `09:51:58` | `A1 S1`: AA 971 → Caldera 662. O hit de `09:52:00` pertence a outro ciclo. | Classificar spell → AA ou criar segundo AA. |
| 13d | essence/Bakragore `00:22:43` | `A1 S1 G1`: AA crítico 2581, spell 1040 e granada 761 do cast `00:22:41`. | Dar dois hits à spell ou ao AA no boss. |
| 13e | essence/Bakragore `00:25:22` | `A1 S1 G1`: AA 2092 ativa cooldown; em `:23`, granada 965 + spell 843. | Tratar os hits posteriores como segundo AA. |
| 13f | essence/Bakragore `00:26:04` | `A1 S1`: AA 914 em `:04`; 705 em `:05` é Caldera. | Ignorar cooldown e criar outro AA. |
| 13g | essence/Bakragore `00:32:58` | `A1 S1 G1`: AA 867, Strong Ethereal Spear 976 e granada 666. | Usar uma granada para explicar 976 e 666. |
| 13h | essence/Echo of Ichgahal `00:20:35` | `A1 S1`: AA 705 e Strong Ethereal Spear 1107, com label concreto. | Exibir o token público `spell`. |
| 14 | darklight e vemiath `22:20:30` | `A7 R8`. A granada real impactou em `:29`; o bloco de `:30` está no nível de AA. | Criar granada falsa em cast+4. |
| 15 | darklight e vemiath `22:22:11` | `A3 S5`: AA + Divine Caldera. A marca heurística de granada é contradita pelo chat. | Preservar `grenade_cast_arrow_only` falso. |
| 16 | darklight e vemiath `22:41:16` | `A1`, sem `partialEdge`: existe `Using` dentro de ±1 segundo. | Descartar o turno como corte de borda. |
| 17 | darklight e vemiath `22:45:34` | `A6`. `Using great fireball` conta como tentativa/execução, mas não nomeia o dano como runa. | Runa roubar hits apenas pela linha `Using`. |
| 18 | darklight e vemiath `23:22:28` | `A4 S4`. Prefixo de AA com leech alto + sufixo Divine Caldera. | Promover todo o turno para spell. |
| 19 | darklight e vemiath `23:23:20` | `A8 S8 G10`. Caldera ≈887 e granada ≈1123 coexistem no mesmo segundo como blocos distintos. | Fundir ações por timestamp igual. |
| 20 | darklight e vemiath `23:24:39` | `A1 S5`. O primeiro hit 819 é AA; o sufixo é Divine Caldera. | Classificar 819 como spell. |
| 21 | darklight e vemiath `23:28:34` | `A17`, somente AA. | Promover all-arrow no turno do cast de granada. |
| 22 | darklight e vemiath `23:28:36` | `A11 S16 G15`. A explosão atrasada pertence a este turno. | Perder a granada ou atribuí-la ao turno do cast. |
| 23 | barrage `18:59:16` | `A7 S7`. AA físico variável + Divine Caldera; o cast de Barrage cai em outro segundo. | Aplicar o eixo físico de Barrage sem cast compatível. |
| 24 | barrage `18:59:18` | `A8 S7`. Fronteira no salto não-crítico → crítico separa AA de Ethereal Barrage. | Manter crit-state misto no mesmo bloco. |
| 25 | barrage `19:00:30` | `A7 S9`. Intervalos físicos adjacentes são disjuntos apesar de médias próximas. | Comparar apenas médias de dano. |
| 26 | barrage `19:00:38` | `A7 S8`. AA em `:38` e Barrage em `:39`, separados pelo timestamp do cast. | Fundir blocos que atravessam o cast. |
| 27 | barrage `19:01:17` | `A9 S8`. Hit 400 é AA crítico overkill; granada não pode ser hit solto no bloco físico. | Criar granada falsa por cooldown-shadow. |
| 28 | barrage `19:02:45` | `A8 S5`. Hits 916/939/912 variam no mesmo mob e permanecem AA. | Converter todo o bloco em granada por cast+4. |
| 29 | barrage `19:03:32` | `A9 S7`. Intervalos físicos disjuntos separam AA e Barrage em blocos contíguos. | Fundir os dois eixos físicos. |
| 30 | barrage `19:04:40` | `A10 S9`. Intervalos físicos se sobrepõem; leech ≈0,0955 → ≈0,120 define o desempate. | Usar leech antes de esgotar a evidência física. |
| 31 | barrage `19:00:15` | `A5 S6` (S-018/D-029). Turno de Divine Caldera (`exevo mas san`, sem `exori dir moe`); sem mob mods pós-corte. Os 5 hits de AA de área têm life-leech = 0; os 6 de Caldera têm life-leech ≈165 (cap zera os 2 últimos). A fronteira geral por leech de vida separa A5 S6. | Colapsar o turno em `A0 S11` por ausência de mob mods pós-corte. |
| 32 | mazzerinbarrage `23:46:36` (sessão 30/Jun/2026 23:45–23:51) | `A12 S12` (S-004a + degeneração de alinhamento). Cast `exevo mas san` no mesmo segundo dos 24 hits. darklight matter+EW `986/986` são Caldera (`O={982}` sob P=1; `O∈[876,877]` sob o buff de `utevo grav san` de `23:46:32`) e `987` é AA (`O={983}` ≠ 982; físico `[844,887]` ∩ bloco AA `[881,887]`). O corte `12,24` fecha com leech 24/24 exato e ambos os blocos buffados. | Colar 986/987 do mesmo mob+estado por tolerância de interseção (S-004a) ou escolher `A11 S13` por alinhamento cast↔turno degenerado maximizando o bloco de spell. |
| 33 | mazzerinbarrage `03:42:26` (sessão 17/Jun/2026 salva `03:48:57`) | `A4 S4`. 4 hits de AA físico variável (591/583/606/590) + 4 hits críticos idênticos de Divine Caldera (`exevo mas san`, 1533 cada) no mesmo mob (boar man). A reversão holy exata do bloco crítico (`mit=0,96551513671875`, `crit=2,00` calibrado da sessão, `mod=1,12` = holyDmgMod 1,1 + pierce BM 0,04) cai num buraco de arredondamento: `invCeil(794, 1,12)` não tem solução inteira (708→793, 709→795, pula 794). Descartada hipótese de escalar errado por 7 outros hits críticos do mesmo mob/spell/sessão (danos 1517, 1498, 1384, 1539, 1602, 1901, 1401) que fecham sem problema com os MESMOS `mod`/`crit`. A tolerância intermediária elemental (`ELEMENTAL_INTERMEDIATE_TOLERANCE`), estendida também à etapa final da cadeia (inversão do `mod` elemental, não só a etapa inicial pós-`post`), aceita os vizinhos `708`/`709` como original. Mesma classe de gap resolve, na mesma sessão, os turnos `03:48:33` (`A6 S6`) e `03:48:39` (`A7 S6`). | Rejeitar o turno como `unresolved` por o gap de arredondamento cair na etapa final da cadeia D-010a, onde a tolerância antes só cobria a etapa inicial (`aa`, pós-`post`). Ver `openspec/changes/extend-elemental-intermediate-tolerance-to-mod-inversion` (arquivado). |
| 34 | uhax 3 `20:49:26` (sessão 30/Jun/2026 salva `21:02:55`) | `partial_edge_missing_evidence`: primeiro turno parcial com 7 hits de druid, sem spell ofensiva concreta no Local Chat e sem `Using one of ... runes` no Server Log disponível; a única hipótese gerada é `arrow[7]`, inválida por M-031/M-032. O turno permanece diagnosticável, mas não entra na visualização operacional nem na contagem de sem classificação. | Inventar AA de área para druid, inventar runa/spell ausente ou contar perda de informação de borda como falha operacional. |
| 34a | death echo `11:06:01` (sessão salva 10/Jul/2026) | `partial_edge_missing_evidence`: primeiro turno parcial; o Server Log começa depois do blast inicial de Death Echo, preservando apenas o bloco baixo do estágio atrasado e um AA antes dos 7 hits críticos de Energy Wave em `:02`. O cast concreto de Energy Wave explica apenas o sufixo, e M-016d-1a proíbe confirmar o estágio atrasado sem ao menos um par comparável com o blast inicial. O turno inteiro permanece diagnosticável, mas fica fora da operação, métricas e relatório. | Confirmar o estágio atrasado sem contraparte, fundir os 17 hits em Energy Wave ou manter um primeiro turno não resolvido como pendência operacional. |
| 34b | mrowdy 2 `17:19:16` (sessão salva 11/Jun/2026) | Permanece `unresolved/no_valid_partition`: é o início de uma sessão interna colada no meio do mega-log, sem cast ofensivo nem linha `Using` preservados. O motor não pode inferir runa; por decisão explícita do usuário, a chave `mrowdy 2\|2026-06-11\|17:19:16` entra somente no catálogo de pendências aceitas do relatório. | Inventar runa a partir de conhecimento externo, marcar o turno como resolvido ou criar heurística temporal para detectar emendas internas. |
| 35 | death echo `11:06:08` (sessão salva 10/Jul/2026) | `A1 + Death Echo`: AA crítico 175; blast inicial em `:08–:09` (roaming dread 870, cyclursus 820, crypt mage 800) e echo atrasado em `:10` (435, 409/410, 400), ligado ao cast `exevo mort ora` de `:09`. Cada explosão valida seu próprio `N_leech`; ambas agregam sob a mesma ação. | Fazer o echo de `:10` ancorar novo turno ou nomeá-lo Energy Wave. |
| 36 | death echo `11:06:11` (sessão salva 10/Jul/2026) | `A1 S10`: depois de consumir o echo de `:10`, a próxima âncora independente é `:11`; hit 130 é AA e os 10 hits restantes são `Energy Wave (exevo vis hur)`. | Manter a âncora em `:10` e absorver echo + Energy Wave num único componente. |
| 37 | death echo `11:06:20` (sessão salva 10/Jul/2026) | `A1 + Death Echo`: AA 130, blast integral em `:20` (ex.: 856/806) e echo `1/2` em `:21` (428/404), ambos no mesmo cast/componente e com cardinalidade por explosão. | Criar segunda spell para o echo ou validar os dois blasts como um único `N_leech`. |
| 37a | death echo `11:06:15` (sessão salva 10/Jul/2026) | O turno não pode permanecer sem classificação por `mixed_crit_state` apenas porque hits de `roaming dread` têm `low blow charm` e `crypt mage`/prefixo não têm. Low Blow é crítico por mob/hit (D-008/S-008), não estado global exigido de todos os mobs do componente. | Tratar Low Blow como crit-state de componente e rejeitar o bloco por mistura de hits Low Blow com hits de outros mobs sem Low Blow. |
| 37b | death echo `11:06:35` (sessão salva 10/Jul/2026) | Os hits `cyclursus 2148` em `:36` têm sufixo `(savage blow charm)` e devem ser expostos como Savage Blow, não Low Blow (D-008a/U-011a). O componente de Death Echo permanece crítico, com Savage Blow como modificador por mob/hit. | Colapsar `savage blow charm` no flag `lowBlow` e mostrar `crítico low blow`/`LB`. |
| 38 | monk2 `07:19:35` (sem data/cabeçalho) | `A1 + Spiritual Outburst`: cast `exori gran mas nia` em `:35`; blast inicial em `:35` (5 hits, ~1400–1620) e estágio atrasado Stage 3 em `:36` (5 hits, ~850–950), MESMO turno mecânico (delay=1). 10 hits no componente spell. | Ancorar novo turno em `:36` ou deixar o estágio atrasado sem tag por a reversão elemental (D-010a) genuinamente não fechar para esta spell. |
| 39 | monk2 `07:19:56` (sem data/cabeçalho) | `A1 + Spiritual Outburst`: cast em `:56`; blast inicial em `:56` (8 hits); `:57` sem hits (delay=1 vazio); estágio atrasado Stage 3 encontrado em `:58` (delay=2, hits `906`/`907`/`907`, razão vida/dano `~0,208`) e consolidado de volta ao turno de origem via cluster de leech. 11 hits no componente spell. | Deixar o blast inicial incompleto (8 hits, sem estágio atrasado) ou tentar fechar o estágio atrasado por reversão elemental holy (nunca fecha para esta spell). |
| 40 | monk2 `07:19:58` (sem data/cabeçalho) | `A1(781) + Greater Flurry of Blows`: turno independente seguinte preserva seu próprio AA (`781`, razão `~0,521`, distinta) e os 6 hits reais de Flurry of Blows (razão `~0,137`), sem o estágio atrasado órfão do cast de `:56` (que pertence ao caso 39). | Rotular `906` como AA deste turno (na verdade é o estágio atrasado de `:56`) ou fundir o estágio atrasado com os hits reais de Greater Flurry of Blows por estarem no mesmo segundo bruto. |
| 41 | mazzerinbarrage `23:21:27` (sessão salva `09/Jun/2026 00:00:54`) | `partial_edge_missing_evidence` (T-001a + T-007/A-009). Primeiro turno **do log** (`seq 1`) numa sessão que atravessa a meia-noite (`23:21:27` → `00:00:50`): 6 hits críticos de Royal Paladin, sem spell/runa/granada concreta no recorte, e a única hipótese `arrow[6]` cai por `physical_intersection_empty` (o `darklight striker` reverte `O∈[730,789]` contra o cluster `[607,619]`). Equivalente em RP do caso 34 (druid) — a vocação e a razão de rejeição mudam, a causa não. Confirmação independente de que a borda levou hits: o leech dos 6 visíveis fecha **exato** em `N_leech = 9` nos dois canais e nos quatro mobs (source `1042→106/34`, pillar `1047→107/35`, matter `1131→115/41` com Void's Call, striker `1133→123/37` com Vampiric Embrace); `N=10` é contradito. | Ordenar por segundos do dia e marcar `partialEdge` em `00:00:00` (o último turno cronológico); exigir vocação de AA single-target ou a razão `multiple_arrow_hits_not_allowed` para reconhecer perda de informação de borda; ou classificar os 6 hits inventando componente. |
| 42 | mazzerinbarrage `01:21:04` (sessão salva `09/Jul/2026 01:26:16`) | `A8 + Ethereal Barrage 8 + Divine Grenade 9` (T-005/U-004 + T-003). Três blocos coerentes num turno de 2s: 8 hits não-crit em `:04` (AA, interseção física `[854,856]`), 8 críticos em `:04` (`exori dir moe`, interseção `[981,983]`) e 9 em `:05` com `O_holy` homogêneo `[1012,1013]` em **quatro mobs distintos** — a granada do cast `exevo tempo mas san` de `01:21:02`, explodindo em `cast+3` (M-023). O leech confirma os três: `N=8/8/9`, com **18 de 18** encaixes exatos no bloco de granada. `AA + spell + granada` é combinação permitida por T-005 e a única forma prevista por U-004 de duas ações com natureza de spell no mesmo turno. O cast era disputado com `01:21:06`; como este resolve sem ele (`A8 + Caldera 13`) e `01:21:04` não resolve de forma alguma, o cast pertence a `01:21:04`. | Descartar o cast por empate de desempate, deixando os 25 hits sem componente (T-003) e perdendo o cast até como execução (M-020/A-004); ou desempatar por contagem de hits do bloco de granada (aqui o vencedor tem 9 contra 12 do concorrente). |
| 43 | mazzerinbarrage `16:24:10` (sessão salva `17/Jun/2026 16:35:46`) | `A0 S2` — `Ethereal Barrage (exori dir moe)` (D-011/D-012a). Os dois hits são overkill, no mesmo segundo e com o mesmo crit-state (`orclops bloodbreaker 284 OK`, `norcferatu nightweaver 702 OK`), então a fronteira `A1|S1` era criada exclusivamente entre hits de overkill — sem mudança de segundo, de crit-state, `Using` de runa ou janela de granada que a sustentasse. O leech corrobora dano real parecido apesar dos exibidos divergentes: vida `220`/`232`, mana `71`/`75`. | Cravar um corte AA×spell apoiado só na posição de hits cujo dano exibido está truncado (D-011), em vez de manter o componente único que a evidência sustenta. |
| 44 | uhax 3 S1 `13:34:21` (sessão salva `03/Jul/2026 13:46:53`) | `A0 S0 R12 G0` — Great Fireball com 11 hits visíveis e um virtual comprovado. O setup global infere Bounty Damage nível 26 (`+12,75%`) pelos pares de Poison Charm `2089→2355` e `2161→2436`, confirmado pelo original comum 1290 do Terra Wave `13:39:15`; depois infere Bounty Life nível 15 (`+10%`) pelos AAs unitários independentes. No `walking pillar 939`, Life 50/Mana 25 fecham `N_leech=12`; `N=13` é contradito por vida. (D-010g/D-022b/D-023/D-024/S-014e/C-006) | Tratar Bounty como Prey fixo `1,25`, copiar o nível de dano para Life, usar uma partição criada pelo próprio candidato como evidência, inventar `Vampiric Embrace` no walking pillar ou reduzir a runa para 11 hits. |

### Casos novos obrigatórios

- **Ichgahal:** dois hits no mesmo boss não podem pertencer à mesma Divine Caldera.
- **Bakragore `09:30:13`:** permitir no máximo um AA por ciclo e um hit para Strong Ethereal Spear.
- **Turno `20:58:38`:** o hit 521 não pode virar runa apenas pela linha `Using`.
- **Chagorz:** Sudden Death recebe exatamente um hit; o segundo hit deve formar outro componente.
- **Bakragore `10:01:08`:** nenhum bloco pode receber o rótulo genérico `spell`; cada bloco recebe ação concreta ou `unresolved_component_N`.
- **Bakragore `09:59:53`:** uma granada possui um timestamp de impacto e no máximo um hit no boss.
- **Turno `09:22:43`:** Strong Ethereal Spear recebe no máximo um hit.

### Caso sintético

Usar o turno:

```text
302, 305, 340, 295, 600, 1200
```

Todos os hits usam o mesmo timestamp e mob, sem modificadores, com cast ofensivo confirmado. A aceitação exige:

- 600 e 1200 nunca permanecem no mesmo componente quando seus originais não intersectam;
- o cast pode nomear no máximo um dos componentes;
- o outro componente permanece separado, mesmo sem ação identificada;
- uma linha `Using` simultânea não retira dano da spell confirmada;
- componentes unitários continuam válidos.

## 11. Apêndice de consolidação Unified Comparison

Este apêndice registra as fontes usadas para atualizar este arquivo como fonte única de verdade. As regras normativas continuam nas seções 1 a 10; este apêndice existe para rastrear quais decisões dos documentos auxiliares foram incorporadas e quais documentos não devem ser usados como fonte paralela.

### Fontes consolidadas

- `docs/CLASSIFICATION_RULES_UPDATED.md`: base anterior de regras, especialmente mecânica de turno, runa, granada, cardinalidade, leech absoluto sob overkill e casos-gabarito iniciais.
- `docs/CLASSIFICATION_RULES_revisado.md`: revisão mais nova, incorporada aqui nos pipelines discretos de dano elemental e físico, `effectiveMod` por pierce/Expose Weakness, normalização pós-crítico, proibição de média física para hit individual e checklist de revisão correspondente.
- `js/IMPLEMENTACAO_UNIFIED_COMPARISON_V3.md`: modo auditor; resultados tentativos não são classificação correta e não podem substituir regra normativa.
- `js/IMPLEMENTACAO_UNIFIED_COMPARISON_V4.md`: correções iniciais de EK/leech; leech deve confirmar ou contradizer componente sem apagar AA posicional por overkill.
- `js/IMPLEMENTACAO_UNIFIED_COMPARISON_V5.md`: evolução do motor Unified; reforça separação entre segmentar e nomear, preservando componentes unitários e `unresolved`.
- `js/IMPLEMENTACAO_UNIFIED_COMPARISON_V6.md`: correção de regressões em Bastion EK; overkill não pode criar contradição de leech.
- `js/IMPLEMENTACAO_UNIFIED_COMPARISON_V7.md`: ajustes adicionais do Unified; validações locais não viram regra se conflitarem com este arquivo.
- `js/IMPLEMENTACAO_UNIFIED_COMPARISON_V8.md`: integração do modo Unified Comparison; UI/harness devem expor diagnóstico sem esconder falha atrás do legado.
- `js/IMPLEMENTACAO_UNIFIED_COMPARISON_V9.md`: validações Bastion/Barrage; logs pós-16/06/2026 não podem reutilizar silenciosamente mods pré-corte.
- `js/IMPLEMENTACAO_UNIFIED_COMPARISON_V10.md`: exclusividade de minor charms e tolerância pequena de original elemental; a exclusividade está incorporada em D-021/D-022, e qualquer tolerância deve respeitar D-010a.
- `js/IMPLEMENTACAO_UNIFIED_COMPARISON_V11.md`: validação por canal e consenso por bloco; vida e mana devem ser avaliadas separadamente antes de fallback por soma.
- `js/IMPLEMENTACAO_UNIFIED_COMPARISON_V12.md`: correções de comparação Unified; preserva diagnóstico explícito para casos sem evidência suficiente.
- `js/IMPLEMENTACAO_UNIFIED_COMPARISON_V13.md`: bônus de leech por spell/perk; bônus específicos de ação só podem ser aplicados quando houver fonte mecânica conhecida e ação concreta compatível.
- `js/IMPLEMENTACAO_UNIFIED_COMPARISON_V14.md`: leech cap-aware, consenso por bloco e blocos pequenos; cap não autoriza fusão de componentes incompatíveis.
- `js/IMPLEMENTACAO_UNIFIED_COMPARISON_V15.md`: inferência global de `utevo grav san` e normalização de leech/dano por esse bônus; a inferência deve ser global e diagnóstica, nunca ajuste livre por turno.
- `js/IMPLEMENTACAO_UNIFIED_COMPARISON_V16.md`: regra de validação adicional preservando V15; qualquer validação deve continuar respeitando casts concretos e cardinalidade.
- `js/IMPLEMENTACAO_UNIFIED_COMPARISON_V17.md`: crítico inferido para reconstrução de original; crit inferido pode normalizar dano, mas não apaga marcações de crit-state.
- `js/IMPLEMENTACAO_UNIFIED_COMPARISON_V18.md`: `utevo grav san` por componente/ataque; bônus de ataque deve ser aplicado no componente correto, não no turno inteiro por conveniência.
- `js/IMPLEMENTACAO_UNIFIED_COMPARISON_V19.md`: parser e regra mecânica associada; parser só cria fatos observados, não classificação por si só.
- `js/IMPLEMENTACAO_UNIFIED_COMPARISON_V20.md`: `no_leech_evidence`, tolerância intermediária elemental e tolerância adaptativa de leech; ausência de leech é evidência ausente, não permissão para fundir componentes.
- `js/IMPLEMENTACAO_UNIFIED_COMPARISON_V21.md`: AA virtual por charm e partial edge; charms elegíveis podem indicar borda/parcial, mas procs não contam como hits principais de `N_leech`.
- `js/IMPLEMENTACAO_UNIFIED_COMPARISON_V22.md`: restrição de classificação de spell por tabela ofensiva; somente spells ofensivas conhecidas podem nomear componente de dano.
- `js/IMPLEMENTACAO_UNIFIED_COMPARISON_V23.md`: precedência de `Using one of ... runes` e fronteira de runa; incorporado em M-017/M-018a/A-005, sem permitir que `Using` invente dano.
- `js/IMPLEMENTACAO_UNIFIED_COMPARISON_V24.md`: elemental cluster para ação concreta; cluster elemental só nomeia componente quando existe ação concreta compatível.
- `js/IMPLEMENTACAO_UNIFIED_COMPARISON_V25.md`: inferência robusta de Life/Mana Leech; canais devem ser inferidos por componentes confiáveis e preservando exclusividade de minor charms.
- `js/IMPLEMENTACAO_UNIFIED_COMPARISON_V26.md`: documento rotulado internamente como V27; Terra Burst bonus, prioridade antes de cluster genérico, leech e overkill baixo só são válidos quando preservam ação concreta e cardinalidade.
- `js/IMPLEMENTACAO_UNIFIED_COMPARISON_V28.md`: pierce, Expose Weakness e BM/Battle Momentum; pierce/Expose Weakness foram normatizados em D-010c. BM deve ser inferido por evidência global consistente, não por análise pesada local que ajuste classificação turno a turno.

### Regras consolidadas a partir do histórico Unified

- **C-001 — Documentos auxiliares não são fonte paralela:** os arquivos `CLASSIFICATION_RULES_UPDATED.md`, `CLASSIFICATION_RULES_revisado.md` e `IMPLEMENTACAO_UNIFIED_COMPARISON_V*.md` são histórico de implementação. Após esta consolidação, a decisão normativa deve citar este arquivo.
- **C-002 — Comparação não substitui regra:** divergência entre Unified, experimental e legado é diagnóstico. O vencedor mecânico é a regra deste documento, não o resultado que faz mais casos passarem.
- **C-003 — Parser não classifica:** parser cria fatos observados (`hit`, `cast`, `Using`, leech, charm, modifier). A classificação exige segmentação e nomeação conforme S-001 a N-011.
- **C-004 — Spell ofensiva por tabela:** spell só pode nomear componente se estiver em tabela ofensiva conhecida e se o cast concreto estiver dentro da janela normativa M-013. Spells de suporte, cura, buff, treino ou utilidade não classificam dano.
- **C-005 — Bônus de ação não é ajuste livre:** bônus de `utevo grav san`, spell/perk, BM, pierce, Expose Weakness ou qualquer outro efeito conhecido deve ser aplicado no eixo mecânico correto antes de comparar originais/leech. É proibido ajustar dano, leech ou pierce por turno apenas para fechar uma hipótese.
- **C-006 — Inferência global antes de turno local:** leech base, minor charms, BM e efeitos globais devem ser inferidos a partir de evidência consistente no log ou no recorte analisado, preferencialmente fora do loop pesado de classificação por turno. A inferência não pode depender do rótulo que ela tenta provar. Quando o input contiver sessões/porções separáveis por cabeçalho de `Channel ... saved`, cada sessão deve inferir seu próprio setup de leech antes de classificar seus turnos; uma sessão não deve herdar leech base ou minor charm de outra sessão do mesmo arquivo concatenado.
  Quando houver dois caminhos de inferência dentro da mesma sessão, como voto geral multi-`N` e componentes confiáveis por `Using`, o caminho mais específico só deve substituir o fallback se sua cobertura de evidência for ao menos tão consistente quanto a do fallback no mesmo canal. Evidência parcial de runa não pode impor um leech base global que contradiz a maioria dos hits utilizáveis da própria porção.
  A votação do candidato de rate base do personagem (life/mana) deve seguir o mesmo princípio de D-025/S-014e: uma observação com `observado < esperado` (capped-low, leech truncado por cap de HP) é sempre consistente e **nunca** pode penalizar um candidato de rate na pontuação ou no desempate. Só `observado > esperado` além da tolerância é contradição real contra um candidato. Um candidato vencedor deve ser o que melhor explica o cluster majoritário de observações dentro da tolerância (D-024), nunca o que apenas minimiza quantas observações caem abaixo dele.
  A rate base do personagem e o minor charm por-mob (D-021) devem ser resolvidos **conjuntamente**, nunca em duas etapas sequenciais onde a base é votada cega a mob e o charm só é testado depois, em cima da base já fixada. Um mob com minor charm real não pode distorcer a base votada para os demais mobs só porque domina o volume de observações da sessão, e um bônus de charm real não pode ser descartado só porque, testado sobre uma base ainda errada, parece piorar o ajuste — a busca deve avaliar a combinação `(base, bônus por mob)` que melhor explica a sessão inteira, sempre restrita à grade de D-020 e aos charms de D-021.
  Quando houver Bounty Talisman (D-010g/D-022b), o setup da sessão deve
  carregar dois candidatos independentes: nível de dano e nível de Life Leech.
  O dano deve ser inferido primeiro pela testemunha determinística de charm
  comparável de D-010g, quando ela existir. Somente na ausência real dessa
  testemunha o fallback pode usar componentes-ouro ou Mana Leech de `N`
  conhecido, sempre congelados antes de testar o nível. Depois de normalizar o
  dano, a vida deve ser resolvida conjuntamente com base e minor charm. O alvo
  local não pode criar a evidência de seu próprio setup, e observação cuja
  classificação/cardinalidade muda sob o candidato não pode votar nele. Hits
  marcados e controles não marcados pertencem à mesma sessão, mas os
  multiplicadores só se aplicam aos marcados. Sessões sem o sufixo preservam o
  comportamento anterior e não herdam níveis de outra porção do mesmo arquivo.
- **C-007 — Ausência de evidência não é contradição:** `no_leech_evidence`, mob sem mod conhecido, sessão pós-corte sem tabela preenchida ou falta de canal de vida/mana geram evidência ausente. Evidência ausente não autoriza fusão de componentes nem reuso de ação.
- **C-008 — Procs não são hits principais:** `damage reflection`, `wound charm`, `overpower charm` e procs anexos podem ser diagnósticos, mas não incrementam `N_leech`, não consomem cast, não viram componente e não criam AA virtual sem regra de borda/parcial aplicável.
- **C-009 — Runa confirmada preserva fronteira, não turno novo:** `Using` pode confirmar execução e precedência de bloco compatível, mas não separa turno. Turno permanece bloco mecânico de ciclo conforme T-002 e combinações de T-005/T-006.
- **C-010 — Cluster genérico é fallback:** cluster elemental/físico só pode ser usado depois de aplicar ação concreta, cast, `Using`, topologia, cardinalidade, cooldown, leech e originais. Cluster não pode roubar hits de ação concreta compatível.
- **C-011 — UI e comparação usam Unified auditável:** tabelas, gráficos, histogramas, timeline, hits, dano e drill-down devem exibir a classificação Unified quando a tela estiver validando o Unified, preservando divergências/diagnóstico para auditoria.
- **C-012 — Inferência de BM usa evidência cross-mob holy E física, combinada:** a inferência global de BM (C-006) compara `pierce=0` contra `pierce=0.04` em DOIS canais de evidência cross-mob — blocos holy concretos (`spell`/`grenade` RP, ≥2 mobs distintos) e blocos físicos "limpos" (subconjunto de hits de um componente `arrow` RP sem overkill/crítico/Onslaught/Low Blow/active prey/Expose Weakness, ≥2 hits de ≥2 mobs distintos) — nunca só o canal holy. Isso existe porque `effectiveMod` (D-010c) é assimétrico: mobs com `baseMod ≥ 1` (vulneráveis) convertem só metade do pierce em mod efetivo, enquanto mobs com `baseMod < 1` (resistentes) convertem 1:1 até fechar a distância a 100%. Uma sessão cujos mobs holy testáveis são todos vulneráveis (ex.: `mazzerinbarrage`, pack de carnivostrich/liodile/boar man, todos `holyDmgMod ≥ 1.10`) tem o canal holy estruturalmente menos sensível — mas o MESMO mob pode ser resistente no eixo físico (o boar man é `physicalDmgMod = 0,90`), e o canal físico revela o sinal que o holy perde. Os dois canais são combinados somando `okBlocks`/`failedBlocks` das duas hipóteses antes de aplicar os critérios de margem (mais amostra agregada = decisão mais confiável); a largura média dos intervalos (`avgWidth`) nunca é somada entre canais (o intervalo físico é estruturalmente mais largo, por causa do roll de armadura, do que a reversão holy quase-exata) — o critério de estreitamento é satisfeito se qualquer um dos dois canais, isoladamente, o cumprir. Caso-prova: sessão `mazzerinbarrage` salva `17/Jun/2026 03:48:57` — canal holy sozinho fica em quase-empate (38→39 blocos OK, 1→0 falhas, nenhum critério de margem bate); canal físico sozinho cruza a margem com folga grande (126→133 blocos OK, 7→0 falhas), e a decisão combinada infere `bmPierce = 0,04` corretamente.

- **C-012a — Testemunha de charm decide o BM sem classificar (caminho primário quando existe):** o dano de charm ofensivo é **fixo por mob** (sem sorteio) e vale `hitpoints × 0,05 × mitigação × effectiveMod(modElemento, pierce)` — a mesma fórmula de M-036. Como `pierceForElement` aplica o BM **somente** a `holy` e `physical`, os charms desses dois canais são testemunhas **diretas e determinísticas** do perk: **`wound charm`** (físico) e **`divine wrath charm`** (holy). Quando existir testemunha suficiente, o classificador DEVE decidir `bmPierce` por ela, **antes de qualquer resolução de turno** — tornando desnecessária a classificação-sonda sob a hipótese alternativa que C-012 exige. Sem testemunha, C-012 permanece o caminho (é o fallback obrigatório: sessões pré-cutoff não têm `hitpoints` na tabela de mods, D-016).

  Condições de uma linha de testemunha: `(mob, charm, estado de Expose Weakness)` com **≥3 procs** (mesmo piso de M-036, contra truncamento por vida restante), **fora** de janela de `utevo grav san` (mesma exclusão de M-036), em mob presente na tabela do regime da sessão e com `hitpoints` conhecido. O veredito exige **unanimidade** entre as linhas discriminantes; qualquer conflito devolve a decisão a C-012. É proibido decidir o perk por maioria de linhas.

  **`overpower charm` NÃO é testemunha**, ainda que `CHARM_ELEMENT_MAP` (`js/unified-classification-engine.js`) o mapeie hoje como `physical`: ele não é dano físico. Evidência de apoio: incluí-lo como físico produzia, em `mazzerinbarrage` S8/S9/S10, uma linha que não fechava com **nenhuma** das duas hipóteses de pierce; removê-lo zera os indeterminados. O mapeamento em si permanece **sob suspeita e não corrigido** (M-036 usa o mesmo mapa; há 812 procs de `overpower charm` nos fixtures) — investigação registrada, fora do escopo desta regra.

  **Desacoplamento de M-036 (circularidade):** o bônus de classe de bestiário também multiplica o dano de charm, e sua detecção depende do `bmPierce`. A circularidade é quebrada pela assimetria dos dois efeitos — o BM afeta só `holy`/`physical`, o bônus de classe afeta **todos** os elementos daquela classe. Logo, os charms de elementos **imunes ao BM** (`fire`/`ice`/`death`/`earth`/`energy`) medem o bônus de classe sem contaminação, e só então as linhas `holy`/`physical` da mesma classe, corrigidas por ele, testemunham o BM. Uma linha cuja classe **não** tem testemunha imune é **não-discriminante** — é proibido assumir bônus de classe igual a 1 para poder usá-la (mesmo princípio conservador de C-006 para rate base × minor charm).

  Casos-prova (veredito por charm = `bmPierce` que C-012 já inferia, com **zero** classificações): `mazzerinbarrage` S8–S13 → `0,04` (ex.: sessão salva `28/Jun/2026`, `darklight matter`/wound+EW n=18 observado `1656` vs previsto `1656,7` com BM e `1628,1` sem; `darklight source`/divine wrath+EW n=8 observado `1587` vs `1585,9`/`1556,0`). Controle negativo real: `serverlog6`/`7`/`8`/`9` e `monk 2` → `0` (o detector conclui ausência do perk, não apenas "sem sinal"). Medido no corpus: 74 sessões, 11 com veredito, **0 divergências** contra C-012; ganho de ~52–62% do tempo nas sessões cobertas (`mazzerinbarrage` S11 `16,4s → 6,2s`).
