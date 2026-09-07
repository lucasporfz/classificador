# Tasks

As fatias 2 a 5 são verticais: cada uma atravessa motor + assert vermelho→verde + diff de
escopo, e é verificável sozinha.

**Turn stories (todos os alvos, exaustivo).** Formato:
`Como <fixture> S<N> <HH:MM:SS>, quero ser classificado <A/S>, porque <evidência>`.
As duas sessões não têm cabeçalho `Channel ... saved`, então não têm data.

`picture` S0:
1. `20:46:15` → **A0 + Berserk 8** (hoje `A1 S7`). O primeiro hit (`sabretooth 845`, vida 43,
   mana 28) declara `N ≈ 8,4` nos dois canais sob a taxa corrigida — ele acertou 8 alvos,
   logo não é auto-ataque single-target. Separar dele um AA é AA fantasma (`H-005`/`H-005e`).
2. `20:49:11` → **A1 + Berserk 2** (hoje `A0 S3`). Primeiro hit (`gore horn 641`, vida 155,
   mana 99) declara `N = 1,03`/`1,04`; o sufixo declara `N = 2,06`/`2,11` = `k−1`.
3. `20:50:13` → **A1 + Front Sweep 3** (hoje `A0 S4`). Primeiro hit (`sabretooth 783`, vida
   185, mana 119) declara `N = 1,06`; sufixo `N = 3,17` e `3,08` = `k−1`; o terceiro hit é
   overkill e não estima.

`ek boss` S0 (todos hoje `A0 S4`, todos `A1 S3` corretos; em todos o primeiro hit tem leech
de vida ≈ **metade exata** do dano, que é a taxa base a `N = 1`, e o sufixo declara `N = 3`):
4. `19:41:43` → **A1 + Fierce Berserk 3**. Vida capada em todos; mana do 1º hit
   (`maior domus 529`, mana 85) declara `N = 1,00`; sufixo `N = 3,00`/`3,00`/`2,96`.
5. `19:41:47` → **A1 + Berserk 3**. 1º hit `maior domus 399` vida 200 (`N = 1,00` nos dois
   canais); sufixo `N = 2,99`/`2,98`/`2,99`.
6. `19:41:51` → **A1 + Fierce Berserk 3**. Vida capada; mana do 1º (`293`, mana 47)
   `N = 1,00`; sufixo `N ≈ 3,00`.
7. `19:42:02` → **A1 + Berserk 3**. 1º hit `maior domus 502` vida 251 = exatamente metade;
   sufixo `N = 3,00`/`3,00`/`2,96`.
8. `19:42:33` → **A1 + Berserk 3**. 1º hit `maior domus 316` vida 158 = metade exata; sufixo
   `N ≈ 3,00`.
9. `19:42:39` → **A1 + Fierce Berserk 3**. 1º hit `maior domus 353` vida 177 = metade exata;
   o hit `118` com vida `308` é overkill e não estima.
10. `19:43:34` → **A1 + Executioner's Throw 3**. 1º hit `maior domus 501` vida 251 = metade
    exata; os hits de `amp kor` restantes são majoritariamente overkill (`M-034`).
11. `19:44:09` → **A1 + Executioner's Throw 3**. 1º hit `maior domus 269` vida 135 = metade
    exata.
12. `19:44:29` → **A1 + Fierce Berserk 3**. 1º hit `phosphorus 294` vida 147 = metade exata;
    sufixo `N = 3,00`/`3,00`/`3,00`.
13. `19:44:33` → **A1 + Berserk 3**. 1º hit `phosphorus 310` vida 155 = metade exata; sufixo
    `N = 2,99`/`3,00`/`2,99`.
14. `19:39:12` → **sem classificação** (hoje `A1`). Pendência aceita pelo usuário: hit único
    de `moonsilver sentinel` cuja mana excede o esperado por 1 ponto além da tolerância. Ver
    Riscos em `design.md`.

## 1. Prefactor — baseline aceito antes de tocar `js/`

**Bloqueia todas as demais tasks.**

- [x] 1.1 Rodar `node tools/query-unified-dump.mjs --verify-source`. Registrar o exit code. Se
      for `3`, o `latest` não serve de baseline: avisar o usuário e gerar fotografia própria
      com `node tools/dump-unified.mjs --write-candidate` **antes** de qualquer edição em
      `js/`, sem promover.
- [x] 1.2 Rodar `node tools/run-unified-checks.mjs` e registrar quais alvos já falhavam
      (baseline do `CLAUDE.md`: 41/46, gabarito 217/217, invariantes 39/40 com a falha
      conhecida de `bakradrone 09:57:20`). Anotar que o corpus tem **41 pares** (o baseline
      do `CLAUDE.md` foi medido com 40, antes de `picture`).
- [x] 1.3 Guardar as linhas de `bastion`, `ek boss`, `night harpy` e `picture` do dump
      baseline num arquivo próprio, para o diff de escopo das tasks 3 e 4.
- [x] 1.4 Registrar no `docs/CLASSIFICATION_RULES.md` a entrada nova da postura de knight
      (três estados, máquina de estados por cast exato do dono, fronteira de segundo,
      abstenção antes do primeiro cast, Protector nos dois pontos da fórmula, Blood Rage
      declarado e não revertido), com os números medidos e os dois casos-prova de fronteira.

## 2. Máquina de estados de postura (sem efeito sobre dano ainda)

- [x] 2.1 Construir `context.stanceSetup` em `js/unified-classification-engine.js`, ao lado
      dos demais setups por sessão: casts do dono com casamento exato de `utamo tempo` e
      `utito tempo`, ordenados por timestamp, produzindo a linha do tempo de três estados.
      Sessão sem esses casts devolve conjunto vazio e o setup fica inerte.
- [x] 2.2 Expor a consulta por timestamp com a fronteira decidida: o estado de um hit é o
      vigente **antes** de qualquer cast no mesmo segundo; antes do primeiro cast, `unknown`.
- [x] 2.3 Escrever `tests/unified-knight-stance.test.mjs` cobrindo a máquina de estados sem
      tocar em dano: transições (`utamo` de neutra → protector, `utamo` de protector →
      neutra, `utamo` de blood_rage → protector, `utito` sempre → blood_rage), o `unknown`
      do prefixo, a fronteira de segundo, e a rejeição de `utamo tempo san`/`utito tempo san`.
      Ver vermelho antes de implementar.
- [x] 2.4 Verificar que o dump dos 4 fixtures alcançados continua **byte-idêntico** ao
      baseline — nesta task nada de dano mudou ainda.

## 3. Protector no dano e na base de leech — alvos do `picture` (stories 1–3)

- [x] 3.1 Escrever os três casos de `picture` em `tools/gabarito-unified.mjs` com a
      classificação esperada das stories 1–3. Rodar com `--only picture` e **ver o vermelho**,
      confirmando pelo output que os três casos foram selecionados.
- [x] 3.2 Aplicar o multiplicador `0.85` do estado `protector` em `postMultiplier`
      (`js/unified-formulas.js`), no mesmo ponto de prey/grav san/bônus de classe.
- [x] 3.3 Aplicar o mesmo `0.85` no divisor de `leechDamageBasis`
      (`js/unified-setup-inference.js`), junto de prey/Bounty/grav san.
- [x] 3.4 Rodar o gabarito filtrado e **ver o verde** nos três casos.
- [x] 3.5 Diff de escopo: `node tools/dump-unified.mjs --pairs "picture"` contra o baseline.
      Esperado: exatamente 3 turnos mudam, e são os das stories 1–3. Qualquer outro turno
      mantém o RASCUNHO.

## 4. Alvos do `ek boss` (stories 4–14) e o zero-drift de `bastion`/`night harpy`

- [x] 4.1 Escrever os dez casos de ganho de auto-ataque (stories 4–13) em
      `tools/gabarito-unified.mjs`. Rodar com `--only "ek boss"` e **ver o vermelho**.
- [x] 4.2 Rodar o gabarito filtrado e **ver o verde** nos dez.
- [x] 4.3 Diff de escopo: `node tools/dump-unified.mjs --pairs "ek boss,bastion,night harpy"`
      contra o baseline. Esperado: exatamente 11 turnos mudam em `ek boss` (as dez stories
      mais o `19:39:12`), e `bastion` e `night harpy` ficam **byte-idênticos** — os dois só
      lançam `utito tempo`, e o Blood Rage não é revertido.
- [x] 4.4 Registrar `ek boss` `19:39:12` como pendência declarada no relatório da change, com
      o diagnóstico do `Void's Call` de `moonsilver sentinel` (6 hits do mesmo mob pedindo
      `≈0,1705` de mana contra `0,16` do personagem).

## 5. Abstenção de postura desconhecida

- [x] 5.1 Excluir hit em estado `unknown` do conjunto-ouro dos dois canais de leech e das
      testemunhas de dano de charm, registrando o motivo no diagnóstico da sessão.
- [x] 5.2 Estender `tests/unified-knight-stance.test.mjs` com o caso: hits antes do primeiro
      cast de postura não votam na taxa. Ver vermelho antes.
- [x] 5.3 Confirmar que `bastion` (3 hits de 1.492 antes do primeiro cast) continua
      byte-idêntico — o fixture nunca lança `utamo tempo`, então a exclusão não deve mudar a
      taxa votada. Se mudar, é sinal de que a exclusão está removendo mais do que deve.

## 6. Validação completa e revisão

- [x] 6.1 `node tools/run-unified-checks.mjs`. Critério: **não piorar** contra o baseline da
      task 1.2 — as mesmas falhas de antes, nenhuma nova.
- [x] 6.2 `node tools/dump-unified.mjs --write-candidate` e
      `diff reports/unified-dump/latest/dump-unified.txt reports/unified-dump/candidate/dump-unified.txt > diff-unified.txt`.
      Esperado: 14 turnos, todos em `picture` e `ek boss`.
- [x] 6.3 `node tools/diag-changed-turns.mjs --diff diff-unified.txt > reports/model-knight-protector-stance-review.txt`.
- [x] 6.4 Rodar `mattpocock-skills:code-review` nos dois eixos (Standards e Spec) e apresentar
      os dois relatórios separados.
- [x] 6.5 Apresentar ao usuário os 14 turnos em três grupos (alvos, colaterais explicados,
      colaterais suspeitos) e **esperar aprovação explícita**. Silêncio e teste verde não
      valem como aprovação.
- [x] 6.6 Apagar os protótipos joga-fora: `tools/proto-stance-corpus-scan.mjs`,
      `tools/proto-protector-in-engine.mjs` e os `proto-*` da Fase 2 listados em
      `reports/picture-diagnostico.md`.
- [x] 6.7 Depois da aprovação: arquivar a change e
      `node tools/dump-unified.mjs --promote-candidate`.
