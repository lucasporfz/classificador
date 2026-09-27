# Change B — sub-linhas do beam de sorcerer — Fase 2 (diagnóstico)

Data: 27/Set/2026. Motor: Unified no HEAD `15d0db7`, com as opções da UI. Baseline:
`query-unified-dump --verify-source` dá "idêntica ao latest" (21.981 turnos, 73 sem classificação).
Nada em `js/` foi editado. As medições por elemento rodaram numa cópia de `js/` fora do repo, com um
único patch: a lista de elementos iterada pelo validador de beam passa a ser configurável. A
classificação usa a lista inteira; só as chamadas de medição feitas depois restringem o elemento.

Sondas (em `reports/beam-subline-b-fase2/`, rodar da raiz do repo; todas aceitam `ENGINE_ROOT`):
- `probe-b.mjs [--only <substr>] [--hits]`: o **comando vermelho** dos 17 alvos e das 3 guardas.
  Leva ~20 s, dá exit 1 enquanto houver alvo vermelho e é determinística (run1 e run2 batem).
- `sweep-beams.mjs`: retrato dos 402 beams do dono do log em 9 fixtures (pré e pós-cutoff).
- `measure-beam-elements.mjs` (`MEASURE_DIR=<pasta fora do repo>`): em que elemento o validador de
  hoje fecha, nas três entradas em que é chamado (turno inteiro, sufixo e bloco final).
- `probe-overkill-proof.mjs`: que prova de "leech não-capado" tem cada overkill dos alvos.
- `find-sessions.mjs`: índice de sessão de um timestamp.

## 1. Loop vermelho

`node reports/beam-subline-b-fase2/probe-b.mjs` → **17 vermelhos** (saída completa em `probe-b-run2.txt`;
com `--hits`, `probe-b-run1.txt`).

| alvo | hoje | vermelho |
|---|---|---|
| `alumnishocks 2` S0 18:30:18 | fire st1 0,2954; rótulos certos | elemento fire ≠ energy |
| `aquatic` S2 13:05:51 | death st3; 5 hits sem rótulo | elemento; central sem `763 OK`; side sem `2376 OK, 2509, 2606×2` |
| `death echo` S0 11:06:22 | energy st3; rótulos certos | elemento energy ≠ death |
| `dlc ms` S1 21:52:46 | death st3; rótulos certos | elemento death ≠ fire |
| `alumnishocks 2` S0 18:26:16 | death st3; c=684×2 | elemento, stage 3 ≠ 1, rótulos invertidos |
| 18:31:29 | death st3; c=466×2 | idem |
| 18:31:42 | death st3; c=480; 1334 OK sem rótulo | idem |
| 18:31:58 | death st3; s=489 | tem sub-linha, e não deveria ter |
| 18:22:39, 18:25:35, 18:27:45, 18:28:09, 18:30:11, 18:31:14 | bloco final não fecha como beam (18:22:39 e 18:31:14 têm carimbo órfão) | sem beam, elemento e stage; rótulos errados ou ausentes |
| 18:25:16 | energy st1; 5 overkills sem rótulo | central sem `20 OK, 1156 OK`; side sem `145 OK, 94 OK, 235 OK` |
| `dlc ms` S0 21:44:27 | bloco final em `same_mob_state_exact_original_mismatch` (carimbos órfãos) | bloco final não fecha em fire 0,8721 |
| `aquatic` S0 10:44:32 | `588 OK` sem rótulo | `588 OK` deveria ser central |

Guardas (fotografia de hoje, comparadas antes e depois): `kim` S0 16:15:56 `A0 S7` sem rótulo;
`Mrowdy 2` S0 e `ms boss` S14 17:16:37 `A1 S5` sem rótulo.

**Expectativa ajustada em relação à Fase 1:** `death echo` 11:06:22 tem central `[504 OK, 1700, 1805]`.
O `504 OK` tem vida 170 e mana 109, iguais às do central `cyclursus 1700`, e é assim que ele está hoje
("rótulos iguais aos de hoje"). O caso-prova escrito em M-035 diz `504 OK → null` (ver Q2).

## 2. Por que está vermelho (pela saída)

**Elemento.** O validador (`validateBeamSublineBlock`) testa `{death, energy, fire}` e ordena os
resultados válidos por `delta` da fração. O texto de M-035 manda outra coisa: spread primeiro e o
perfil só como desempate. Nos 4 alvos de elemento, a estância prevê o elemento certo (arm/rearm →
energy; `rearm → death`; `converted → fire`), e ele também fecha. Quem escolhe o errado é o `delta`.

**Varredura (402 beams, `sweep-beams-head.tsv`).**
- Pré-cutoff (`Mrowdy`, `Mrowdy 2`, `ms boss`, 14 beams): **nenhum** bloco final fecha como beam.
- Pós-cutoff: fecham fora do elemento da estância exatamente os 8 alvos da Fase 1 (4 em death st3 no
  `alumnishocks 2`, 1 em fire st1, 1 em death no `aquatic` S2, 1 em energy no `death echo` e 1 em
  death no `dlc ms` S1).
- Stage entre os validados: `alumnishocks` e `alumnishocks 2` só stage 1 em energy; os demais só
  stage 3. Os 4 em stage 3 do `alumnishocks 2` estão todos em death, ou seja, são as coincidências.
- Todos os casts de beam têm estado conhecido: energy `arm`/`rearm` (`alumnishocks`, `aquatic`,
  `kim`), death `rearm` (`death echo`), fire `converted` (`dlc ms`) e `not_applicable` no pré-cutoff.

**Restringir o elemento à máquina de M-043, medido (`measure-beam-elements-head.tsv`):**
- bloco final: perdem validação 18:26:16, 18:31:29, 18:31:42 e 18:31:58, os quatro só fechavam em
  death; nenhum outro beam perde;
- sufixo (`shouldForceA1ByLeech`): os mesmos quatro, mais `kim` 16:27:29, que só fecha em fire;
- turno inteiro (linha 340): só 18:26:16.

**A decisão A0/A1 (`resolveSingleTargetAaVocationTurn`, `unified-turn-resolution.js:339-484`).** A
ordem da escada é: `Using` de runa → teto do Executioner → overkill do Executioner → **timestamp** →
Death Echo → **beam no turno inteiro ⇒ A0** → beam com leech neutro ⇒ A0 → crit ⇒ A1 → same-mob ⇒ A1
→ multiestágio → virtual → **forceA1** (inclui "sufixo valida beam") ⇒ A1. Nos 388 beams
pós-cutoff:

- 203 são A0 pelo beam no turno inteiro;
- 41 são A1 por timestamp, acima do beam e portanto protegidos;
- **44 são A1 decididos abaixo do beam** (26 pelo sufixo que valida o beam, 12 por crit, 5 por
  same-mob e 1 por crit+forceA1). Qualquer validação nova no turno inteiro pode virá-los A0;
- os demais são A0 pelo default ou por leech.

Das perdas medidas acima, só 18:31:29 mexe na contagem: o A1 dele vem do sufixo. 18:26:16, 18:31:42
e 18:31:58 são A1 por timestamp. `kim` 16:27:29 é A0 pelo turno inteiro, que fecha em energy. Isso
reproduz o `A0 S7` medido na change A.

**Rótulos que faltam.** O rótulo de um hit é a unanimidade dele entre todas as distribuições
válidas, reunidas de **todos** os elementos, stages e leituras de contagem. Além disso, o leech não
separa overkill nem capped-low: um overkill aceita qualquer `N` por D-025. Em `aquatic` S2, por
exemplo, `{4394, 4394, X}` fecha para `X ∈ {763 OK, 2509, 2606, 2376 OK}`, e o resto só fica
determinado quando o `763 OK` é posto no nível dele pelo Dreal.

**Forma A (central só em overkill).** As âncoras, que são os hits não-overkill, formam um nível só no
elemento da estância, e o validador exige dois clusters de âncoras. Sem uma âncora no central, não há
corte, e a forma A só fecha hoje num terceiro elemento, por coincidência.

**Leech esparso.** `dlc ms` S0 21:44:27: a sub-linha lateral (k=5) tem 1 confirmação e 0
contradições, e o consenso exige `minOk = 2`. O override de spell concreta
(`shouldOverrideSparseLeechForConcreteDeterministicSpell`) precisa de `det.ok`, que
`beamSublineLeechOk` não tem.

**Prova de não-capado dos overkills (`probe-overkill-proof-run1.txt`).** Três critérios medidos:
- P1: vida e mana dão um Dreal com interseção. Não depende de N;
- P2': todo hit posterior do mesmo cast ainda ganha aquele canal, ou seja, a reserva nunca encheu;
- P3: o overkill tem leech idêntico ao de um não-overkill do mesmo mob e estado.

| overkill | P1 | P2' (mana) | P3 |
|---|---|---|---|
| 18:22:39 (3 centrais), 18:25:35, 18:26:16, 18:30:11, 18:31:14, 18:31:29 (2), `death echo` 504 | sim | sim | — |
| 18:31:42 `1334 OK` (vida 200 capada) | não | sim | não |
| 18:28:09 `1591 OK` (vida 403 capada) | não | sim | não |
| `aquatic` S0 `588 OK` (vida 0) | não | sim | sim (3004) |
| `aquatic` S2 `763 OK` / `2376 OK` | não¹ / não | sim / sim | não / sim |
| 18:25:16 `1156 OK`, `145 OK`, `94 OK`, `235 OK`; 18:27:45 `1185 OK` | não | sim | — |
| **`kim` 16:15:56 `323 OK`** (mana 261, depois 176, depois 0) | não | **não** (posteriores com mana 0) | não |
| `Mrowdy 2` 17:16:37 `1593 OK`, `369 OK` | não | sim | sim (2303, mesmo nível: sem sub-linha) |

¹ A vida de `aquatic` S2 é 0,2725. Com 0,27 (S0/S1) a interseção existiria.

## 3. Hipóteses ranqueadas

**H1 — Elemento pela máquina de M-043 e M-035b, juntos, não tiram validação nem mexem na contagem
A/S dos alvos.** Com o elemento restrito, só 18:26:16, 18:31:29, 18:31:42 e 18:31:58 perdem
validação (medido). M-035b devolve as três primeiras em energy stage 1, com o central tirado do Dreal
do overkill; 18:31:58 fica corretamente sem sub-linha (forma E: `361 OK` tem o leech dos `537`) e
continua A1 por timestamp.
*Predição:* com (1)+(3), 18:31:29 volta a A1 pelo sufixo e nenhum outro beam perde validação.
Nenhum dos 44 A1 decididos abaixo do beam vira A0: no turno inteiro, o AA não-overkill não cabe em
nível nenhum. *Colateral previsto, para revisão:* `alumnishocks 2` 18:24:35 (hoje `A0` + beam 7) pode
virar A1, porque o `wardragon 40 OK` só fecha em `N=1` e o sufixo validaria.
*Falsifica:* um beam, além desses quatro, que perca validação, ou um A1→A0 entre os 44.

**H2 — Stage por sessão, por unanimidade entre os beams validados no elemento da estância.**
*Predição:* depois da restrição, cada sessão tem um stage só: `alumnishocks`/`alumnishocks 2` = 1;
`kim`, `dlc ms` S0/S1, `aquatic` S0–S2 e `death echo` = 3. O pré-cutoff não tem beam validado e fica
com o stage desconhecido, todos admitidos como hoje e sem drift. Fixar o stage não tira validação
nenhuma, e é ele que impede o central por overkill de fechar num stage por coincidência (ver H4).
*Falsifica:* uma sessão com dois stages entre as validações no elemento da estância.

**H3 — Os rótulos que faltam vêm da unanimidade sobre distribuições reunidas e do leech cego a
overkill, e quem os resolve é a verificação de nível do overkill provado, não a restrição.**
*Predição:* só com elemento e stage restritos, `aquatic` S2 13:05:51 continua com 5 hits sem rótulo
e 18:25:16 com 5 overkills sem rótulo. Com a regra "o original do Dreal de um overkill provado tem de
cair no nível da sub-linha dele", `763 OK` vai para o central, a cardinalidade força o resto e os dois
alvos fecham com 0 sem rótulo.
*Falsifica:* os rótulos aparecem só com a restrição, ou continuam faltando com a verificação.

**H4 — "Leech provadamente não-capado" = P1 ∪ P2' deixa todos os alvos verdes e mantém as guardas.**
*Predição:* só com P1, 18:31:42 e 18:28:09 ficam vermelhos, porque o central deles só tem prova pela
mana. Com P1 ∪ P2', todos fecham. `kim` 16:15:56 fica como está, porque o `323 OK` falha P2' (os
hits seguintes já não ganham mana). Um P2 fraco ("algum posterior ganha") daria ao `kim` um central
`{323 OK, …}` com fração ≈ 0,774 contra 0,7766 (stage 3, lateral 3+ e central 2), ou seja, uma
regressão da guarda. *Risco a medir:* com magic shield, a mana cai no meio do cast pelo dano recebido,
e P2' teria de olhar as linhas de dano recebido entre os hits.
*Falsifica:* algum alvo fica vermelho sob P1 ∪ P2', ou `kim` 16:15:56 ganha rótulos.

**H5 — O leech esparso na sub-linha ("≥1 confirmação e 0 contradição") põe `dlc ms` S0 21:44:27 em
fire st3 0,8721, e sozinho ele tira rótulos.** Ele aumenta as distribuições válidas e, pela
unanimidade, pode apagar rótulos de beams que já fecham, e só a verificação de nível (H3) os devolve.
*Predição:* com (4) sem H3, alguns hits hoje rotulados perdem o rótulo; com H3, nenhum perde. Na
linha 340, nenhum dos 44 A1 vira A0.
*Falsifica:* nenhuma perda de rótulo com (4) sozinho, ou um A1→A0.

## 5. Decisões do usuário (27/Set/2026)

- Q1: vale **P1 ∪ P2'**. Um canal é não-capado quando todo hit posterior do mesmo golpe ainda ganha
  esse canal, porque então a reserva não estava cheia.
- Q2: o `504 OK` do `death echo` 11:06:22 é **central**, e o caso-prova de M-035 é corrigido.
- Q4: o stage da Beam Mastery é um só na sessão inteira, e isso já estava decidido. O que falta é só
  implementação: o motor deduz o stage dos beams da sessão e o trava.
- Q3: sim. O leech ajuda a rotular as sub-linhas: todo overkill provado é posto no nível que o Dreal
  dele indica, não só o que forma o central (18:25:16, `aquatic` S2 13:05:51).
- Q5: rótulo em AA é indiferente. O critério é a classificação do beam: rótulo órfão que deixa um
  beam com sub-linha errada tem de mudar, e o que está certo fica. Isso substitui o "não apagar" da
  Fase 1. Hoje 16 beams carregam rótulo sem que o bloco final prove o beam. Três deles são alvos
  (`alumnishocks 2` 18:22:39 e 18:31:14; `dlc ms` S0 21:44:27). Os outros 13 serão julgados na Fase 3
  pela evidência: `alumnishocks 2` 18:24:35; `kim` 16:14:08, 16:18:55, 16:19:24, 16:21:24, 16:23:43
  e 16:25:31; `dlc ms` S0 21:42:38, 21:43:03, 21:43:41, 21:44:49 e 21:45:37; `dlc ms` S1 22:00:15.

## 4. Ambiguidades para decidir antes da Fase 3

1. **Definição de "provadamente não-capado"** (M-035b): P1 sozinho deixa 18:31:42 e 18:28:09 fora.
   Recomendo P1 ∪ P2'.
2. **`death echo` 11:06:22, `504 OK`:** central, como hoje e pelo leech igual ao do `1700`, contra o
   `null` escrito no caso-prova de M-035. Recomendo central e corrigir o texto de M-035.
3. **Verificação de nível para todo overkill provado, e não só para formar o central:** ela é o que
   rotula 18:25:16 e `aquatic` S2 (H3). É extensão de M-035b; ela entra em M-035b?
4. **Stage por sessão:** unanimidade (senão desconhecido, com todos os stages admitidos). E de qual
   passada ele sai: uma passada extra, como o tier do Executioner em M-034b, ou uma passada que já
   existe?
5. **Carimbos órfãos:** não são apagados. Mas como a B restringe o elemento, alguns deixam de ser
   **criados**, porque a validação que os gerava some. Exemplo: os AAs de 18:22:39, 18:26:16 e
   18:30:18 hoje carregam `beamSide`. Isso conta como "apagar"?
