## Why

**Problema (visto da rotação na UI).** A linha de um beam de sorcerer se divide em sub-linhas
central e lateral (M-035), e hoje o motor erra essa divisão de três jeitos:

- **Escolhe o elemento do beam pela conta mais bonita**, e não pela estância. Ele testa death,
  energy e fire e fica com o que dá o menor desvio da fração, então oito beams saem no elemento
  errado. Exemplos: `alumnishocks 2` 18:30:18 em fire, com o personagem em energy; `death echo`
  11:06:22 em energy, com o personagem em death.
- **Não enxerga o central que só aparece em overkill.** Quando o raio do meio mata o alvo, o log
  mostra só a vida que sobrava, e as âncoras do beam formam um nível só. O motor só "fecha" esses
  beams num terceiro elemento por coincidência, e aí inverte central e lateral. Exemplos:
  `alumnishocks 2` 18:26:16, em death e stage 3, com `684×2` no central quando o central é
  `175 OK`; 18:31:29 e 18:31:42. Em mais seis beams da mesma sessão ele nem fecha.
- **Deixa overkills sem rótulo, ou com rótulo que não vem de prova.** O leech de um overkill aceita
  qualquer número de alvos, e a sub-linha com uma confirmação é reprovada enquanto a com zero passa.
  Exemplos: `aquatic` S2 13:05:51 tem 5 hits sem rótulo, e `dlc ms` S0 21:44:27 deixa de validar.
  Em 16 beams, os rótulos exibidos são carimbos de outra passada.

O `beamSide` é o único caminho pelo qual o beam afeta o dano base da UI, então cada rótulo errado
é dano base de sub-linha errado.

**Solução (mesmo ponto de vista).** O beam passa a sair no elemento da estância, com a ordem da
máquina de M-043. Na sessão do Alumni Shocks ele fica em stage 1, e nas outras em stage 3. O raio
do meio que só aparece em overkill passa a ser reconhecido pelo dano real que o leech dele prova.
Todo overkill com prova vai para o nível que o dano real dele indica, e o que já passa do nível
lateral não pode ser lateral. Nenhuma contagem A/S muda e nenhum beam perde validação.

## What Changes

- **Elemento do beam pela estância (M-035 + M-043).** O beam usa a ordem da máquina de M-043:
  - `converted` → [estância, nativo];
  - `arm`/`rearm` → [estância];
  - `native`/`unknown` → [nativo, estância];
  - o segundo elemento só entra como último recurso;
  - pré-cutoff: nativo;
  - estância desconhecida: busca livre, com o spread primeiro e o perfil no empate, que é o que o
    texto de M-035 já manda.

  O bloco genérico de um beam que não fecha também usa o primeiro elemento da máquina. M-043 deixa
  de excluir o beam.
- **Stage da Beam Mastery por sessão.** É um fato de setup: a unanimidade entre os beams validados
  sem leech. Sem unanimidade o stage fica desconhecido, com os três admitidos como hoje. O texto de
  M-035 ("nenhum log do corpus exercita stage 1 ou 2") é corrigido: Alumni Shocks é stage 1.
- **M-035b (regra nova): central só em overkill, provado pelo leech.**
  - **Prova de não-capado:** um overkill tem o dano real provado quando vida e mana concordam
    (dano real exato), ou quando um canal nunca encheu: todo hit seguinte do mesmo golpe ainda
    ganha aquele recurso, sem perda dele no meio.
  - **Central por overkill:** quando as âncoras formam um nível só, o nível do central sai desse
    dano real. Só contam overkills do mesmo estado de crítico das âncoras.
  - **Nível:** todo overkill provado tem de cair no nível da sua sub-linha.
  - **Piso:** um overkill cujo piso passa do nível de uma sub-linha não está nela. O piso vem do
    dano exibido ou do leech observado, que só podem subestimar o dano real.
  - **N da sub-linha:** conta os hits virtuais de charm-kill (S-014e).
- **Leech esparso na sub-linha.** A sub-linha aceita "≥1 confirmação e 0 contradição", a mesma
  regra da spell concreta.
- **Parser:** cada hit passa a saber quantas perdas de vida e de mana o server log mostrou antes
  dele. É só um fato observado; a prova de não-capado usa.
- **Caso-prova de M-035 corrigido:** o `504 OK` de `death echo` 11:06:22 é central, como já
  está hoje e como o spec `unified-beam-overkill-subline-cardinality` já exige.

## Capabilities

### New Capabilities

- `unified-beam-central-from-overkill`: M-035b. O central que só existe em overkill, a prova de
  dano real (vida e mana concordam, ou reserva que não encheu), a verificação de nível de todo
  overkill provado, o piso e o N com hit virtual.

### Modified Capabilities

- `unified-sorcerer-elemental-stance`: o beam passa a ter o elemento pela ordem da máquina (hoje
  a regra o exclui). Pré-cutoff usa o nativo; estância desconhecida faz busca livre com o spread
  primeiro.
- `unified-beam-mastery-stages`: o stage é um só por sessão, inferido e travado antes da passada
  final.
- `unified-beam-overkill-subline-cardinality`: a sub-linha aceita o leech esparso. O dano
  exibido de um overkill passa a poder **excluir** um nível, como piso, embora continue sem
  **escolher** tier por proximidade.

## Impact

- **Motor:**
  - `js/unified-validation.js`: `validateBeamSublineBlock` e `beamSublineLeechOk`, com helpers
    novos de prova e piso na mesma vizinhança;
  - `js/unified-formulas.js`: `sorcererSpellElement` para beam;
  - `js/unified-session-context.js`: campo novo do `SessionSetup`;
  - `js/unified-classification-engine.js`: inferência do stage antes da passada final;
  - `js/unified-parsing.js`: contadores de perda de recurso nos eventos.
- **Raio:** só sessões com beam do dono do log. No protótipo, os 6 fixtures de sorcerer pós-cutoff
  (1.395 turnos) tiveram **0 contagens** mudadas, 69 turnos com mudança de rótulo, elemento ou
  stage e 1 turno só de resolver. Os controles (sorcerer pré-cutoff, druid e paladin; 45 sessões,
  5.445 turnos) não mudaram.
- **Regras:** `docs/CLASSIFICATION_RULES.md` ganha M-035b; M-035 recebe as emendas de stage por
  sessão, elemento pela estância, o stage 1 do Alumni Shocks e o caso-prova do `504 OK`; M-043 deixa
  de excluir o beam.
- **Glossário:** `CONTEXT.md` ganha Piso, Estância, Sub-linha e Stage da Beam Mastery; a entrada
  Dano real exato é emendada.
- **UI:** nenhum código de UI muda. Ela já lê `beamSide` e passa a exibir os rótulos corrigidos.
