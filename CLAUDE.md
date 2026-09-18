# CLAUDE.md

## Motor único: Unified (NUNCA analisar pelo legado)

Este projeto trabalha **só com o motor Unified** (`js/unified-classification-engine.js`
via `js/unified-main.js`). É ele que a UI (`index.html`) roda e é o único motor a ser
alterado, diagnosticado ou citado em análises.

- **Diagnóstico de turno:** `node tools/diag-unified-turn.mjs "logs/<sv>.txt"
  "logs/<lc>.txt" HH:MM:SS[,...] [DD/Mon/YYYY]` — roda o Unified com as MESMAS opções
  da UI (tabela pós-cutoff por data da sessão, strictLeech, maxOriginal 6000, float16
  mitigation) e mostra status, hits com evidence físico e as violações das partições
  rejeitadas.
- O classificador legado foi **removido do repositório** em 21/Jul/2026
  (`remove-legacy-classifier`): `js/classifier.js`, `js/classifier-parser.js`,
  `js/parser-rp-helpers.js`, `js/rp-grenade-peak.js` e as 12 ferramentas que os
  carregavam (`diag-turn.mjs`, `rp-classify-proto.mjs`, `dump-all.mjs`,
  `find-turn.mjs`, `gabarito.mjs` etc.) não existem mais. Se instruções de um CLAUDE.md
  pai mandarem usar `diag-turn.mjs`, ignore: neste repositório só existe o Unified.
  Toda ferramenta de `tools/` roda o Unified.
- Tabelas de mobs por regime: sessões datadas ≥ 16/Jun/2026 usam
  `js/mob-element-mods-post-2026-06-16.js` (o Unified seleciona pela data). A entrada
  `bloodjaw` dessa tabela é manual (fora do bestiary) e está sob suspeita de
  calibração (armor).

## Sem vínculo com o repositório original (`../claude`)

Este repositório é **independente**. Não existe obrigação de espelhar, sincronizar ou
manter byte-identidade com o app original (`../claude`) — aquele repo roda o classificador
legado, que aqui é proibido. Isso vale mesmo que instruções de um CLAUDE.md pai mandem
"aplicar a mesma mudança nos dois repos": neste repositório, não se replica nada para fora.

Consequência para OpenSpec: **nenhuma proposta deve conter tarefa de espelhar/replicar a
mudança no repo original.** Não criar seção "Espelhar no repo original" em `tasks.md`.

## Fonte única da verdade

A única fonte de verdade para regras de classificação é:

`docs/CLASSIFICATION_RULES.md`

Não criar outro arquivo de regras paralelas sem aprovação explícita.

## Regra principal

Antes de qualquer implementação, revisão, teste ou refatoração relacionada ao classificador, leia integralmente:

`docs/CLASSIFICATION_RULES.md`

Toda decisão de classificação deve ser justificada por uma regra existente nesse arquivo.

Se uma implementação contradiz `docs/CLASSIFICATION_RULES.md`, a implementação está errada.

## Arquivos importantes

- `docs/CLASSIFICATION_RULES.md`: regras do domínio e critérios de validação.
- `tools/run-unified-checks.mjs`: executor da validação obrigatória (gabarito +
  invariantes + todos os `tests/*.test.mjs`).
- `tools/unified-experimental.mjs`: harness do gabarito curado (`--gabarito`) e da
  varredura exaustiva de invariantes mecânicos (`--invariants`).
- `tests/*.test.mjs`: testes derivados das regras (descobertos do disco pelo runner).
- `reports/reviewer_report.md`: relatório do agente revisor.

## Restrições obrigatórias

- Não alterar UI.
- Não alterar classificador de produção.
- Não substituir fluxo atual por fluxo experimental sem aprovação explícita.
- Não modificar gabaritos esperados apenas para fazer testes passarem.
- Não remover testes problemáticos.
- Não inventar regra nova fora de `docs/CLASSIFICATION_RULES.md`.
- Se uma regra estiver ambígua, registrar a ambiguidade no relatório em vez de decidir silenciosamente.

## Comandos obrigatórios após mudanças

Depois de qualquer alteração no classificador, rodar:

```bash
node tools/run-unified-checks.mjs
```

Isso roda os três alvos (dá pra isolar com `--gabarito`, `--invariants`, `--tests`):

- gabarito curado pré-2026-06-16 (`tools/unified-experimental.mjs --gabarito`);
- varredura exaustiva de invariantes mecânicos sobre **TODAS as sessões de TODOS os pares,
  em qualquer regime** (`--invariants`) — cobre M-024/M-025 cross-turno, cardinalidade,
  T-006 e rótulos concretos, que o gabarito curado não cobre. A cobertura é normativa
  (D-017a): a única exclusão admitida é `CORPUS_EXCLUSIONS`, e é **proibido** reintroduzir
  recorte por data. Travada por `tests/unified-invariants.test.mjs`;
- todos os `tests/*.test.mjs`, descobertos do disco.

**Não usar `python`/`pytest`.** Este repo é 100% Unified/JS. Os antigos
`tools/run_classifier_evals.py`, `tests/test_classifier_golden.py` e
`tests/test_classification_rules.py` não tinham lógica própria — eram
`subprocess.run(["node", ...])` sobre exatamente estes alvos — e foram removidos.
Cobriam a menos que o runner atual (três `tests/*.test.mjs` nunca eram chamados).
CI (`.github/workflows/validate.yml`) sempre foi 100% Node e nunca dependeu deles.

**Medição de C3 (18/Set/2026, `hit-reversal-memo`, otimização, drift ZERO, 1,50×).**
C3 do survey `reports/architecture-deepening-candidates.md`, passo 3 da sequência (C2 → C1 → **C3**).
`physicalOriginalInterval`/`elementalOriginalCandidates` ganharam uma **camada 1** consultada ANTES do
prólogo (mods, mod, mit, post, crit), chaveada pelas entradas dele; o `_revCache` segue **intocado**
como camada 2. Baseline (`e871098`): 47/55 alvos, gabarito 237/238, invariantes 42/43, dump 21.101
linhas, `15 sept` em 224,7 s, pico de S0 2726 MB. Depois: **48/56** (o alvo a mais é
`tests/unified-hit-reversal-memo.test.mjs`, verde), **as mesmas 8 falhas**, gabarito 237/238,
invariantes 42/43, **diff do dump VAZIO**, `15 sept` em **149,4 s (1,50×; 7,7× contra antes de C1)** e
pico de S0 **2248 MB (−478 MB)**. Acerto da camada 1 em S0: 99,1%, conjunto de trabalho 32 mil
entradas, teto 1 M. Wall do `run-unified-checks` com cache quente: 4 min 27 s (era 4 min 31 s; com
cache frio, logo após editar `js/`, 10 min 54 s). Nenhuma regra mudou. Detalhes em
`reports/c3-hit-reversal-memo.md`.

**Por que é drift zero por construção:** a chave da camada 1 determina a chave de string da camada 2,
que nunca sobrescreve entrada entre limpezas; a camada 1 mora num `WeakMap` pela instância do
`_revCache` e morre em `invalidateReversalCache`. Acerto devolve `===` o objeto que a camada 2
devolveria. **No nível do HIT, `_activeCritKey` e `_omegaAssignment` SÃO entrada** (o inverso do
bloco, C1): a chave leva o crit key efetivo (só em hit `realCrit`) e o bit de omega **resolvido**
(`hit.omegaActive` é mutável entre passadas), mais o grav san resolvido do hit e o
`setupFingerprintId`. **A inconsistência dos probes de `bmPierce` continua inofensiva e não foi
corrigida, por decisão:** o setter troca o setup, a camada 1 erra e cai na camada 2 como antes.
Resultados da camada 2 saem `Object.freeze` (escrita esquecida lança em vez de dar drift).
`gravSanHitInWindow` ganhou memo por `(janelas, ts)`.

**Medição de C1 (17/Set/2026, `block-validation-identity`, otimização, drift ZERO, 4,79×).**
C1 do survey `reports/architecture-deepening-candidates.md`, passo 2 da sequência (C2 → **C1** → C3).
A validação de bloco virou um par pedido/resultado: `blockValidationKey` resume a entrada,
`validateBlockDeterministicAndLeechWithGravModes` devolve um resultado **congelado e memoizado**, e
**`applyBlockResult` é o único ponto de mutação do bloco**. Baseline (`d835fa8`): 46/54 alvos,
gabarito 237/238, invariantes 42/43, dump 21.101 linhas, `15 sept` em 1137,2 s. Depois: **47/55**
(o alvo a mais é `tests/unified-block-validation-identity.test.mjs`, verde), **as mesmas 8 falhas**,
gabarito 237/238, invariantes 42/43, **diff do dump VAZIO** e `15 sept` em **237,2 s (4,79×)**. A
saída do `run-unified-checks` é byte-idêntica à do baseline a menos do teste novo. Nenhuma regra
mudou; `docs/CLASSIFICATION_RULES.md` não foi tocado. Detalhes em
`reports/c1-block-validation-identity.md`.

**A chave é a parte delicada, e três coisas nela são decisão medida:** (a) ela usa a **impressão
digital** do `SessionSetup` (identidade dos 11 campos, memoizada por record), **não** o `epoch` —
o epoch é monotônico e todo probe de setup faz save/restore, então chavear por ele mataria o cache
a cada sonda (o epoch chega a 130 numa sessão de 161 turnos); (b) `turn.actions` entra pelo
**conteúdo**, não pela identidade do objeto, que é reconstruído a cada `resolveTurnInner` — chavear
pela identidade custa 84,1% → 61,7% de acerto; (c) `_omegaCrossStateTolerance` **entra** na chave
(é derivado em relação à resolução, mas entrada em relação ao bloco), enquanto `_activeCritKey` e
`_omegaAssignment` **não podem** entrar: se um deles estiver armado na entrada, a memoização
desliga. Com contexto montado à mão (teste, ferramenta de diagnóstico) o cache também fica
desligado. **`_revCache` continua não chaveado por `epoch`** — a inconsistência dos dois probes de
`bmPierce` segue declarada, para C3.

**Armadilha achada nesta change, e que o protótipo de 4.1 nunca exercitou:** dois validadores
determinísticos **escrevem rótulos nos objetos de hit**, que são compartilhados por todas as
partições — `validateTerraBurstBonusBlock` (`terraBurstBonus*`) e `validateBeamSublineBlock`
(`beamSide`, `beamMastery*`, que também apaga). Esses rótulos são lidos **depois** da resolução
(`unified-turn-resolution.js:1386`, `unified-main.js`, `tools/gabarito-unified.mjs`, dois testes).
Memoizar sem tratar isso pula a escrita e muda o rótulo exibido — `15 sept` não tem Terra Burst nem
Beam, por isso o protótipo não viu. Agora a escrita é **efeito registrado** (`recordHitStamp`),
reaplicado por `applyBlockResult` na ordem de execução, no acerto e na falta de cache.

**Consequência operacional: `node tools/dump-unified.mjs` sem `--pair` estoura 8 GB.** O cache custa
**+260 MB de pico** por sessão viva (2540 → 2800 MB em `15 sept` S0), e o dump monolítico, que já
acumulava os 43 pares num processo só, passou a cruzar o limite. O dump completo agora sai por
**`node tools/dump-unified-per-pair.mjs`** (um processo por par, na ordem de `discoverPairs()`,
filtrando por nome exato porque `--pair` casa por substring). Verificado: 21.101 linhas
byte-idênticas ao dump monolítico.

**Medição de C2 (17/Set/2026, `session-context-records`, refactor de estrutura, drift ZERO).**
C2 do survey `reports/architecture-deepening-candidates.md`: o saco `context` (40 campos, tres
naturezas misturadas) virou tres records com lifetime declarado, em `js/unified-session-context.js`
(novo, carrega ANTES de `unified-formulas.js`). Baseline do working tree antes da change: **45/53**
alvos, gabarito **237/238**, invariantes **42/43**, dump **21.101** linhas. Depois: **46/54** (o alvo
a mais e `tests/unified-session-context-records.test.mjs`, verde), **as mesmas 8 falhas, nenhuma
nova**, gabarito 237/238, invariantes 42/43, e o **diff do dump VAZIO** nas 21.101 linhas dos 43
pares. Nenhuma regra mudou; `docs/CLASSIFICATION_RULES.md` nao foi tocado.

Os tres records, todos acessiveis pelos MESMOS campos de `context` de sempre (accessors, para
sobreviver ao `<script src>` em escopo global, sem tocar nas 114 assinaturas):

- **SessionSetup** — congelado, substituido INTEIRO, com `epoch` que incrementa a cada
  substituicao. 11 campos (`critSetup`, `leechSetup`, `gravSanSetup`, `bountyTalismanSetup`,
  `stanceSetup`, `omegaSetup`, `combatMasteryLadder`, `bestiaryClassBonus`, `aaElement`,
  `weaponPhysicalPierce`, `bmPierce`). Instalado no TOPO de `buildContext`, nao no fim, senao as
  inferencias do proprio corpo (grav san, bounty, omega) fazem save/restore invisivel ao `epoch`.
- **ResolutionState** — vive uma varredura e morre explicito (`beginResolutionPass`, 7 sites).
  6 campos, mais `enterProbeResolutionState`/`exitProbeResolutionState` e
  `invalidateReversalCache` (os 6 `_revCache.clear()` espalhados).
- **HitScope** — escopo dinamico por bloco/hit, um construtor nomeado por campo. A divisao
  `HIT_SCOPE_INPUT_FIELDS` (so `gravSanHitOverride`) vs `HIT_SCOPE_DERIVED_FIELDS`
  (`_activeCritKey`, `_omegaAssignment`, `_omegaCrossStateTolerance`) esta na ESTRUTURA: so o
  primeiro e entrada da validacao de bloco e pode entrar numa chave de cache; os outros tres sao
  setados de dentro dela. Confundir isso foi o que quebrou 90 turnos na 1a tentativa de 4.1.

**`_revCache` NAO foi chaveado por `epoch`, de proposito.** `bmDeterministicVerdict` e
`bmPhysicalDeterministicVerdict` (`unified-setup-inference.js`) trocam `bmPierce` **sem** limpar o
cache, ao contrario dos outros tres probes de setup, que limpam. Chavear por `epoch` consertaria
essa inconsistencia e portanto MUDARIA resultado. Fica como decisao explicita de C1/C3, com
medicao — nao de carona num refactor neutro.

**Numero para C1:** `epoch` chega a **130** numa sessao de 161 turnos (`murcion`). Os probes de
hipotese de setup dominam, nao as 4 varreduras — uma chave de cache por `epoch` puro invalida a
cada probe.

**Armadilhas medidas nesta change:** (a) o motor **nao** e o unico chamador desta camada — testes e
ferramentas de diagnostico montam `context` a mao, sem os records, entao os helpers escrevem por
`context[campo]` e nao pelo record (4 testes quebraram por isso antes da correcao); (b) medir com
`dump-unified --pair` par a par exige filtro por nome EXATO: `--pair` casa por substring e
`server log rp.txt` puxa `murcion`/`darklight`, `barrage Server Log.txt` puxa `mazzerinbarrage`.

**Medição em rascunho (17/Set/2026, `fix-physical-axis-timing-family`, diff de 23 turnos APROVADO pelo usuário; candidate ainda NÃO promovido).**
Baseline do working tree antes da change: **44/52** alvos, gabarito **237/238**, invariantes
**42/43**, dump **21.098** turnos / **284** sem classificação (o corpus e o working tree
cresceram desde 14/Set; `unified-experimental-coverage` passou a falhar por contagem 238 vs 232).
Depois da change: **45/53** (o alvo a mais é `tests/unified-physical-axis-timing-family.test.mjs`,
verde), mesmas 8 falhas, gabarito 237/238, invariantes 42/43, dump 21.098 / **292**. Drift: 23
turnos em `15 sept`, `Crypt`, `drone bounty` e `mazzerinbarrage`, todos aprovados na revisão turno a
turno (`reports/fix-physical-axis-timing-family-summary.md`). A regra é **V-024** emendada
(degeneração de `timing` por família). Baseline salvo em
`reports/unified-dump/baselines/fix-physical-axis-timing-family/`. Armadilha medida: `dump-unified
--pairs` com 21 pares e cache frio estoura 4 GB de heap — rodar em lotes.

**Baseline conhecido (medido em 14/Set/2026, após `infer-drone-bounty-talisman`).**
Total de alvos: **45/52 OK**; gabarito **237/238**; invariantes **41/42** fixtures limpos. Dump:
**20.400** turnos, **59** sem classificação (eram 167). As 7 falhas são as mesmas do baseline medido
antes da change: `gabarito prioritario + invariantes mecanicas` (falhas `tom 2/13:04:16` e
`bakradrone 09:57:20`), `experimental-ui-parity`, `mob-element-regime`, `unified-executioner-overkill`,
`unified-grav-san-ratio-witness`, `unified-overkill-xp-continuity` e
`unified-spiritual-outburst-multistage`. `unified-executioner-overkill`, `unified-overkill-xp-continuity`
e o caso `tom 2/13:04:16` já falhavam no working tree antes desta change. O alvo a mais é
`tests/unified-drone-bounty-charm-witness.test.mjs`.

**Drift: 111 turnos, todos em `drone bounty`** (RP, 14/Sep/2026, cabeçalho `Sept`), que sai de 108 para
0 sem classificação. As regras são **D-010g** (emendada: testemunha de Bounty Damage pelo dano de
charm, com base comum no mesmo mob e âncora de HP, sem exigir controle sem marca, e voto só do
valor modal) e **D-022b** (emendada: Vampiric Embrace no mob marcado só se mede nos hits sem marca;
abaixo do piso de D-021a a Life fica `unknown` e o canal de vida dos marcados se abstém). Resultado:
Bounty Damage **25**; Bounty Life **unknown** (`bounty_life_vampiric_confound`). Revisão em
`reports/infer-drone-bounty-talisman-review.md`.

**Pendências declaradas:** (a) Bounty Life de `drone bounty` indeterminável — os pares
`(Vampiric, nível)` `0/L21`, `1,6%/L11`, `2,4%/L8` e `3,2%/L5` fecham 192/191/183/163 dos 282 hits
marcados, e `converter` tem só 3 hits sem marca (o dono do log confirma um nível baixo, ~5);
(b) o fallback por componentes do `uhax 3` deixou de confirmar o nível 26 (9 encaixes, 3
contradições), com a asserção do teste trocada por decisão do usuário; (c) `js/app.js` (UI) não lê
`Sept`.

**Baseline anterior (medido em 10/Set/2026, após `pair-beam-mastery-stage-fraction-and-rate`).**
Total de alvos: **45/50 OK**; gabarito **231/231**; invariantes **40/41** fixtures limpos, com a
única falha em `bakradrone 09:57:20` (declarada em S-014f). As 5 falhas são as mesmas de sempre e
todas **pré-existentes**: `gabarito prioritario + invariantes mecanicas` (a falha do `bakradrone`),
`experimental-ui-parity`, `mob-element-regime`, `unified-grav-san-ratio-witness` e
`unified-spiritual-outburst-multistage`. O alvo a mais (49→50) é
`tests/unified-beam-mastery-stages.test.mjs`, novo desta change. (A rodada completa mediu 44/49
porque o teste novo entrou no disco depois da varredura começar; `--tests` sozinho, já com ele,
dá 45/49.)

**Sem dump nesta change, por decisão do usuário:** a correção é de modelo, não de resultado — não
existe log de stage 1 ou 2 de Beam Mastery no corpus, então nenhum turno pode exibir a mudança. O
gate usado foi `run-unified-checks` completo (gabarito + invariantes sobre todos os pares) mais uma
varredura dirigida das frações de sub-linha em `kim`, `dlc ms` e `death echo` (192 casts): o único
efeito observável é o cast `kim` `16:15:56`, que perde os marcadores `beamSide` por só fechar com um
par impossível (`F = 0,70` com `+10%` por alvo); o turno continua `resolved` como `Great Energy Beam`
de 7 hits. Em `dlc ms`/`death echo` o diff é vazio a menos do rótulo (`rate=0` → `stage=3` na leitura
cancelante), com fração esperada, contagens e clusters idênticos.

A regra é **M-035** (os três stages da Beam Mastery atrelam fração lateral e bônus por alvo:
`0,25·10%`, `0,40·12%`, `0,70·14%`, teto de 3 alvos) e **M-035a** (o piso da isenção de exatidão
same-mob passa a ser o mínimo sobre os stages, `≈ 0,192`, no lugar do mínimo do stage 3, `0,493`).

**Pendências declaradas de M-035:** (a) **ambiguidade de como o bônus é contado** — a tooltip diz
"per target hit by the central beam" (o bônus cancelaria na razão), mas `kim` `16:12:55` (dois hits
no mesmo mob e estado, `0,7857`, sem liberdade de partição) só fecha com cada sub-linha contando os
próprios alvos, enquanto `dlc ms` tem dezenas de casts em `0,700` exato; as duas leituras ficam
admissíveis por stage; (b) o **stage não é cravado por sessão**, embora seja propriedade do
personagem (precedente `M-034a`); (c) stage 1 e 2 entram **sem testemunha real** no corpus, cobertos
só por teste sintético (precedente `M-042b`).

**Baseline conhecido (medido em 07/Set/2026, após `model-combat-mastery-ladder-and-fix-omega-false-positive`).**
Total de alvos: **44/49 OK**; gabarito **231/231**; invariantes **40/41** fixtures limpos, com a
única falha em `bakradrone 09:57:20` (declarada em S-014f). Dump: **20.174** turnos, **59** sem
classificação, **41 pares**, 140 sessões. Os 2 alvos a mais (47→49) são os dois testes novos desta
change, ambos verdes.

As 5 falhas são as mesmas de sempre e todas **pré-existentes** — conjunto byte-idêntico ao de
antes da change: `gabarito prioritario + invariantes mecanicas` (a falha do `bakradrone`),
`experimental-ui-parity`, `mob-element-regime`, `unified-grav-san-ratio-witness` e
`unified-spiritual-outburst-multistage`.

**Drift desta change: ZERO turnos.** O diff do dump completo é **vazio** — 0 linhas em 20.174
turnos de 41 pares. A change corrige **fatos de setup de sessão**, não classificação: em
`picture` S0 o selo `Omega ×1.06` (falso positivo) desliga e o bônus de classe passa de
inconclusivo a **sem bônus por prova**. As regras são **M-042** (escada de Combat Mastery, com
`M-042a` teto e `M-042b` teto superior) e a cláusula nova de **M-041** (a postura é estado do
proc de dano de charm, nas três leituras que usam o charm como testemunha).

**Raio: 4 sessões com escada em 137 medidas** (`picture` S0 degrau 1%; `tom` S0 e `tom 2` S0
degrau 2%; `crypt` S0 **não** tem escada e fica intacto — é o fixture onde o omega foi
calibrado). Varredura em `reports/proto-charm-ladder-corpus.txt`.

**Pendências declaradas de M-042:** (a) o degrau do Combat Mastery **não é revertido** — o dano
base agregado de um knight com o perk carrega +0 a +6% (média ≈3%), precedente `M-037`; (b) sob
escada, um bônus de classe **grande** deixa vários candidatos abaixo do teto e a classe abstém —
só bônus pequenos, ou classes que exibam o degrau zero, ficam craváveis; (c) a via do teto
superior de `M-042b` (omega por cima da escada) é **declarada e sem caso no corpus**, coberta só
por teste sintético.

**Baseline anterior, para referência (medido em 06/Set/2026, após `model-knight-protector-stance`).**
Total de alvos: **42/47 OK**; gabarito **231/231**; invariantes **40/41** fixtures limpos, com a
única falha em `bakradrone 09:57:20` (declarada em S-014f). Dump: **20.174** turnos, **59** sem
classificação. Corpus: **41 pares** (`picture` entrou em `logs/` em 06/Set/2026).

As 5 falhas são as mesmas de sempre e todas **pré-existentes**: `gabarito prioritario +
invariantes mecanicas` (a falha do `bakradrone`), `experimental-ui-parity`, `mob-element-regime`,
`unified-grav-san-ratio-witness` e `unified-spiritual-outburst-multistage`. O alvo a mais (46→47)
é `tests/unified-knight-stance.test.mjs`, novo desta change.

**Drift desta change: 14 turnos, todos em `picture` e `ek boss`** (o mesmo personagem `Picture`),
em 20.174 turnos de 41 pares. Zero drift nos outros 39 pares — inclusive em `bastion` e
`night harpy`, que são knight mas só lançam `utito tempo`. A regra é **M-041** (postura de
knight: Protector = ×0,85 pós-mitigação **e** divisor da base de leech; Blood Rage declarado e
não revertido). Diagnóstico em `reports/picture-diagnostico.md`; revisão turno a turno em
`reports/model-knight-protector-stance-review.txt`.

Efeito no setup: `picture` sai de vida 28,5% / mana 18,5% para **25% / 16%** com **zero**
contradições (eram 4, todas em Protector); `ek boss` sai de 58,75% / 19% para **50% / 16%**, com
os encaixes exatos de mana subindo de 21 para 103. As quatro taxas novas são pontos limpos da
grade de imbuement de D-020.

**Pendências declaradas de M-041:** (a) o modelo do Protector não é exato — razão leech/dano
medida `1,1657` contra `1,1765` previsto por `1/0,85`, resíduo de ≈0,9%, nada revertido a partir
dele; (b) `ek boss` `19:39:12` passou de classificado para sem classificação (58→59), por um
`Void's Call` de +1,2% faltando em `moonsilver sentinel` que a taxa antiga, inflada, mascarava —
travado por caso de gabarito; (c) a coluna de dano base da tabela **não** desconta o Protector
(decisão do usuário), então a linha de rotação do knight continua sendo a média das três
posturas.

**Baseline anterior, para referência (medido em 01/Set/2026, após `make-leech-channel-abstention-explicit`).**
Total de alvos: **41/46 OK**; gabarito **217/217**; invariantes **39/40** fixtures limpos, com a
única falha em `bakradrone 09:57:20` (declarada em S-014f). Dump: **19.983** turnos.

As 5 falhas são as mesmas de sempre e todas **pré-existentes**: `gabarito prioritario +
invariantes mecanicas` (a falha do `bakradrone`), `experimental-ui-parity`, `mob-element-regime`,
`unified-grav-san-ratio-witness` e `unified-spiritual-outburst-multistage`.

**O corpus tem 40 pares:** `aquatic` (86 turnos, sorcerer `Stingz`, pack de quara, 3 sessões de
31/Ago/2026) e mais um par entraram em `logs/` fora desta change — é de onde vêm os turnos a mais
em relação ao baseline anterior, sem que nenhum turno tenha sido resolvido ou perdido.

**Drift desta change: ZERO** — o dump é byte-idêntico antes e depois, nos 40 pares e 19.983
turnos. A regra é **C-006b** (abstenção de canal de leech é explícita, não taxa zero): o setup
passa a carregar `lifeBaseKnown`/`manaBaseKnown` e `lifeBaseAbstention`/`manaBaseAbstention`; o
`base: 0` continua desligando o canal a jusante, exatamente como antes. Diagnóstico em
`reports/aquatic-s0-life-leech-abstention.md`. Pendência declarada: `aquatic` S0 continua sem
taxa de vida (só 2 observações-ouro, 7 dos 9 hits-ouro no cap de HP) — recuperá-la exigiria
alargar o conjunto-ouro de `componentGoldN`, que é mudança de cobertura, não de canal.

**Baseline anterior, para referência (medido em 27/Ago/2026, após `fix-amp-kor-tier-inference-and-h005g-cut-gate`).**
Total de alvos: **39/44 OK**; gabarito **217/217**; invariantes **37/38** fixtures limpos, com a
única falha em `bakradrone 09:57:20` (declarada em S-014f). Dump: **19.897** turnos, **58** sem
classificação.

As 5 falhas são as mesmas de sempre e todas **pré-existentes**: `gabarito prioritario +
invariantes mecanicas` (a falha do `bakradrone`), `experimental-ui-parity`, `mob-element-regime`,
`unified-grav-san-ratio-witness` (o código de D-030b/D-030c que ela exercita está em `git stash`)
e `unified-spiritual-outburst-multistage`. O alvo a mais (43→44) é o teste novo desta change.

**O corpus tem 38 pares desde 27/Ago/2026:** o fixture `tom 2` (346 turnos, EK, raubritter, mesmo
personagem de `tom` — `Kikaro`, level 1002) entrou em `logs/` durante esta change. É por isso que
o dump vai de 19.548 para 19.897 turnos sem que nenhum turno tenha sido resolvido ou perdido. Ao
comparar com o baseline anterior, exclua `tom 2` ou os números não batem.

**Drift desta change: 1 turno** — `tom 2` `12:58:06`, de `a=0 s=5` para `a=1 s=4`. Zero drift nos
outros 37 fixtures, em 19.897 turnos. As regras são **H-005g** (guarda de último recurso
corrigida: testava mudez sobre o primeiro hit em vez de mudez sobre o corte) e **M-034a** (piso de
cardinalidade para o tier do Executioner's Throw). Diagnóstico em
`reports/tom-amp-kor-diagnostico.md`.

**Pendência declarada de M-034a:** o piso conta hits do bloco **já classificado**, não alvos do
cast, então um AA fundido por engano empurra o tier **para cima** — inverso do viés da razão de
dano, que empurra para baixo. Os dois erros não se cancelam. O próprio `tom 2` `12:58:06` tinha 5
hits antes da correção de H-005g nesta mesma change, e o piso teria cravado `×2.50`. Fora de
escopo e não resolvido: a rotulagem `base`/`amped` por hit (`execBimodalHighSet` corta no maior
salto de leech, que um valor capado sequestra — `tom` `12:35:15` rotula o hit `1185` como `amped`
sendo `base`). Duas tentativas de corrigir isso foram revertidas por quebrarem hits vizinhos.

**Baseline anterior, para referência (medido em 26/Ago/2026, após `infer-weapon-physical-pierce-per-session`).**
Total de alvos: **38/43 OK**; gabarito **253/253**; invariantes **37/38** fixtures limpos, com a
única falha em `bakradrone 09:57:20` (declarada em S-014f). Dump: **19.548** turnos, **58** sem
classificação. `query-unified-dump.mjs --verify-source` dá **exit 0** — o `latest` foi promovido
em 27/Ago/2026 e corresponde ao motor; a defasagem crônica que dava exit 3 acabou.

As 5 falhas são todas **pré-existentes**: `gabarito prioritario + invariantes mecanicas` (a falha
do `bakradrone`), `experimental-ui-parity`, `mob-element-regime`, `unified-grav-san-ratio-witness`
(o código de D-030b/D-030c que ela exercita está em `git stash`) e
`unified-spiritual-outburst-multistage`. O alvo a mais (42→43) é o teste novo desta change.

**Drift desta change: 79 turnos, todos em `moonsilver`** — 78 que passaram de `unresolved` a
resolvido e 1 (`05:24:53`) cuja granada migrou para o turno em que de fato explodiu
(`05:24:51`, `cast+3`). Zero drift nos outros 37 fixtures, em 19.548 turnos. A regra é **M-040**
e o diagnóstico está em `reports/moonsilver-fase2-pierce-fisico.md`.

**O detector de M-040 seleciona o perk em 1 de 132 sessões do corpus** (`moonsilver` S0). Em 93
delas ele nem roda (`insufficient_eligible_blocks`): só há evidência em pack de AoE com ≥3 blocos
de AA de ≥3 hits e ≥2 mobs. Consequência declarada e aceita: em hunt de boss o perk fica
invisível e o dano base sai enviesado sem sintoma. Varredura: `tools/probe-weapon-pierce-corpus.mjs`.

**Baseline anterior, para referência (medido em 26/Ago/2026, após `implement-h005e-h005f-h005g-leech-cardinality-rules`).**
Total de alvos: **36/42 OK**; gabarito **210/210**; invariantes **36/37** fixtures limpos, com a
única falha em `bakradrone 09:57:20` (declarada em S-014f). Dump: **19.356** turnos, **58** sem
classificação — o MESMO número do baseline anterior: a change não resolveu nem quebrou nenhum
turno `unresolved`, só reclassificou turnos já resolvidos.

As 6 falhas são todas **pré-existentes**: `gabarito prioritario + invariantes mecanicas` (a
falha do `bakradrone`), `experimental-ui-parity`, `mob-element-regime`,
`unified-grav-san-ratio-witness`, `unified-spiritual-outburst-multistage` e
`unified-experimental-coverage` (contrato travado em 204 contra gabarito 210 — vem de
`tools/gabarito-unified.mjs` modificado no working tree por #15/#20, não desta change). Os 2
alvos a mais (40→42) são os testes novos desta change.

**Drift desta change: 88 turnos, 100 % `a=0 → a=1`, zero no sentido inverso** — 80 em `tom` e 8
em `ek boss`, **nenhum** em qualquer outro fixture. `tom` sai de **124** turnos `a=0` para
**44**, dos quais 39 são corretos (6 de hit único, 33 cujo primeiro hit declara `N` entre 2 e 9).
Os 8 de `ek boss` são ganho, não colateral: em todos o AA e o bloco da spell acertam o mesmo mob
com dano muito diferente (prova independente por `S-004a`). A ausência de flips no sentido
`a=1 → a=0` é garantida por construção pela semântica **aditiva** de `H-005e`.

**O fixture `moonsilver` (192 turnos) está FORA desta medição por decisão do usuário.** Ele foi
adicionado a `logs/` em 26/Ago/2026 durante a change; o corpus o descobre automaticamente
(38 pares), mas tanto a validação quanto o dump candidato desta change cobrem os **37** pares
anteriores. Ao medir contra este baseline, exclua `moonsilver` ou o número de turnos não bate.

**Baseline anterior, para referência (medido em 24/Ago/2026, após `apply-omega-cross-state-tolerance-as-last-resort`).**
Total de alvos: **35/40 OK**; gabarito **239/239**; invariantes com **1** falha, a declarada em
S-014f (`bakradrone 09:57:20`). Dump: **18.958** turnos, **58** sem classificação.

As 5 falhas são todas **pré-existentes** e idênticas antes e depois da change:
`gabarito prioritario + invariantes mecanicas` (a falha de invariante do `bakradrone`),
`experimental-ui-parity`, `mob-element-regime`, `unified-grav-san-ratio-witness` (o código de
D-030b/D-030c que ela exercita está em `git stash`) e `unified-spiritual-outburst-multistage`.
Os 2 alvos a mais vieram desta change (`unified-omega-cross-state-exactness`,
`unified-omega-last-resort`); os outros 2 do 38 vieram de changes preexistentes no working tree.

**`crypt` saiu de 118 para 1 turno sem classificação** (`07:52:37`, pendência declarada), com
**zero** turnos resolvidos perdidos e **zero** drift fora de `crypt` — as 438 linhas do diff do
dump estão todas em `crypt`, e o conjunto de turnos sem classificação dos outros fixtures é
byte-idêntico. A regra é **S-004c** (+ `S-004c-nota`); o diagnóstico está em
`reports/crypt-omega-1-nivel.md`.

**Atenção ao medir contra este baseline:** `node tools/query-unified-dump.mjs --verify-source`
devolve **exit 3** (fonte divergiu do `latest` aceito) por causa de changes preexistentes não
commitadas em `js/`, não por causa desta. O `latest` aceito (18.955 turnos / 684 sem
classificação) está defasado do working tree; para diff de drift, gere o seu próprio baseline
com `node tools/dump-unified.mjs` **antes** de editar `js/`, e não promova o candidate sem
antes resolver a defasagem.

**Baseline anterior, para referência (medido em 23/Ago/2026, após `rescue-field-hits-with-impossible-leech`).**
Comparar contra ele em vez de exigir verde total. Total de alvos: **32/37 OK**;
gabarito **203/203**; invariantes **35/36** fixtures limpos e **0 SKIP**, com a única falha em
`bakradrone 09:57:20` (limite declarado em S-014f). Dump: **18.955** turnos,
**684** sem classificação.

**O denominador mudou nesta medição — não compare 18.955/684 com 17.105/52 direto.** Duas
coisas entraram de uma vez:

- `CORPUS_EXCLUSIONS` ficou **vazio** (M-038a, issue #11). A hunt `Tue Jun 09 09:30:47 2026`
  voltou ao corpus nos três fixtures em que aparece (`bakra` S4, `drome` S4, `jaded` S4,
  209 turnos cada) e `drome` trouxe junto 4 sessões que nunca tiveram cobertura (391 turnos).
  Contribuição desta change para os turnos sem classificação: **+5** — `09:21:08` contado 3×
  (o tick de campo que M-038a não alcança, leech 3 não excede dano 9) mais `19:52:11` e
  `09:19:56` de `drome`. Todos declarados como pendência conhecida.
- `Crypt Server Log.txt` **já estava no corpus mas nunca esteve no dump aceito**: 832 turnos,
  dos quais **627 sem classificação**. É a origem de 627 dos 632 turnos sem classificação a
  mais, e **não** tem relação com M-038a. `query-unified-dump.mjs --verify-source` não pegou
  a defasagem porque a assinatura da fonte não cobre a lista de pares — é pendência aberta,
  tanto o fixture quanto o furo do `--verify-source`.

Nenhum turno previamente coberto mudou de classificação: as 1.055 remoções do diff são 100 %
renumeração `S<N>→S<N+1>`, porque a hunt reentrou no índice 4 de `bakra` e `jaded`
(verificado linha a linha, 0 linhas do latest sem contraparte).

A hunt entrou com **0 quebras de invariante** — as 5 de `M-012/M-013` que ela tinha eram
resíduo de tick de campo. Os 6 alvos a mais no gabarito (197→203) são dessa hunt. **A falha
`tests/unified-grav-san-ratio-witness.test.mjs` no working tree atual NÃO é regressão**: o
teste está no disco (o `.gitignore` ignora `tests/`) mas o código de `D-030b`/`D-030c` que
ele exercita está em `git stash` — some com `git stash pop`.

Baseline anterior, para referência (22/Ago/2026, após `exclude-field-and-dot-damage-from-main-hits`):
**32/37 OK**, gabarito **197/197**, invariantes **33/34** + 1 SKIP (`drome`), dump **17.105**
turnos e **52** sem classificação. O fixture `ek boss` entrou no corpus nessa data com 8 turnos
sem classificação e 3 quebras de M-009; `M-038` e a correção da topologia de `exori scu` para
`area` zeraram os dois.

Baseline anterior, para referência (12/Ago/2026, após `implement-s014f-boss-leech-no-veto`):
**30/34 OK**, gabarito 187/187, **52** turnos sem classificação de 16.407 (era 246 antes de
S-014f), contagem bruta = `totalUnresolved` + `knownAccepted` + `partialEdge` = 27 + 3 + 22.

O relatório **não exclui mais** leech pré-cutoff: a decisão de 19/Jul/2026 foi revogada em
11/Ago/2026 e a família caiu por `S-014f`, então o filtro padrão saiu junto com a flag
`--include-pre-cutoff-leech` (12/Ago/2026, ticket `#7`). `preCutoffLeechCounted` (ex-`…Excluded`)
virou coluna **informativa**: dos **27** turnos acionáveis, **26** têm causa de leech em sessão
pré-cutoff — concentrados em `bakradrone` 9, `jaded` 5, `darklight e vemiath` 3,
`mazzerinbarrage` 3, `bakra` 2 e 1 em cada de `darklight rp`/`hakka`/`ms boss`/`rp pack`.

- `--invariants`: **32/33 fixtures limpos, 1 SKIP** (`drome`, exclusão canônica de par
  inteiro). Falha **1**: `bakradrone` `09:57:20` (`M-009: unresolved com 3 hits no boss
  unitário`) — é o limite declarado em `S-014f`, não contradição mecânica nova.

  Antes de `S-014f` (baseline de 11/Ago) eram 28/33, com 5 fixtures falhando (`bakra`,
  `bakradrone`, `essence`, `jaded`, `mazzerinbarrage`) por quebras de M-009 derivadas,
  emitidas com `kind='unresolved'` sobre turnos de `unresolved_by_leech_contradiction`
  pré-cutoff ou `partial_edge_missing_evidence` (T-007/A-009). Elas sumiram junto com os
  turnos unresolved que S-014f destravou.

  **As 8 quebras sobre turnos RESOLVIDOS acabaram** (`fix-action-reuse-across-turns`,
  11/Ago/2026): eram `bakra`/`jaded` `10/Jun` `09:29:24`, `ms boss` `13/Jun` `22:19:24`,
  `kim` `14/Jul` `16:24:30`, `rpboss` `17/Jun` `09:40:33`, `uhax 3 ed` `03/Jul` `13:43:55`
  (×2) e `13:44:09` — todas M-015/N-007/N-008 (reuso de ação entre turnos vizinhos). A
  correção foi escolher a ação sobre o bloco final do componente e consumir spell/runa como
  a granada já fazia (M-013a/M-013b, N-008a, M-016d-1c).
- `--gabarito`: **187/187**. As 2 falhas históricas (`essence/00:21:12` e `essence/00:21:14`,
  esperado `A1`, obtido `A0 S0 R0 G0`) caíram com `S-014f` em 12/Ago/2026. Em 11/Ago/2026 o gabarito perdeu 3 casos
  (`grenade-rollover-corpus/bakra` `09:21:00`/`09:23:20`/`09:27:02`) e ganhou 13 da família
  M-015: eram os únicos casos de todo o gabarito dentro de `CORPUS_EXCLUSIONS` (hunt
  `09/Jun/2026 09:18-09:30`), removidos a pedido do usuário. O baseline de 09/Ago
  registrava as mesmas 2 falhas de `essence`.
  (Era **71/79** antes de `prefer-grenade-cast-turn-that-cannot-resolve-without-it`,
  **70/78** antes de `require-discriminating-leech-channel-in-bracket`,
  **62/70** em `68fd1e6` e **59/70** em `bfd4a26`; as changes C-012a e
  `fix-death-echo-delayed-stage-absent-evidence` adicionaram casos e corrigiram falhas.
  Ao atualizar este baseline, medir com o runner completo e não com
  `gabarito-unified.mjs --only`, cujo filtro casa mais amplo que o nome sugere.)
- `--tests`: 3 falhas pré-existentes —
  `experimental-ui-parity` (assert `{arrow:0}` vs `{arrow:1,rune:1}`),
  `mob-element-regime` (`ReferenceError: MOB_ELEMENT_MODS is not defined`),
  `unified-spiritual-outburst-multistage` (assert `[1,2]` vs `[1]`).
  Apesar do nome, `experimental-ui-parity` e `mob-element-regime` carregam **só** arquivos
  Unified/tabelas de mob — não são resíduo do legado.

**A contagem de alvos caiu de 14 para 12 em 21/Jul/2026, e isso NÃO é regressão.** Os dois
alvos que sumiram (`experimental-leech-cardinality`, `experimental-synthetic-case`) passavam,
mas carregavam `js/classifier.js` e o núcleo experimental — ou seja, mediam um motor que este
repositório não usa. Foram removidos junto com o legado (`remove-legacy-classifier`).
De 12 para 34 alvos: são `tests/*.test.mjs` novos, descobertos do disco pelo runner.

**Cobertura de invariantes não pode encolher.** Até 09/Ago/2026 a varredura aplicava D-017
como gate cego de data e pulava 17 dos 34 fixtures — o regime pós-cutoff inteiro ficava sem
cobertura, escondendo 5 quebras em turnos resolvidos. A regra agora é D-017a e há teste que
trava (`tests/unified-invariants.test.mjs`). Se um relatório voltar a dizer "N fixtures fora
do escopo D-017", é bug de cobertura, não escopo legítimo.

**Ao medir baseline num worktree limpo, copiar `tests/*.test.mjs` para dentro dele.**
O `.gitignore` ignora `tests/` (só `validator-smoke`, `fixtures/` e `snapshots/` são
rastreados), então um worktree novo não tem os testes e eles falham por arquivo
inexistente — o que é fácil de confundir com falha real.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`lucasporfz/classificador`), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at repo root, `docs/adr/` for decisions. See `docs/agents/domain.md`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
