# Tasks

As fatias 2, 3 e 4 são **verticais**: cada uma atravessa motor + assert vermelho→verde + diff de
escopo, e é verificável sozinha. A fatia 1 é prefactor e **bloqueia todas as outras**.

> **Ordem corrigida na implementação (07/Set/2026).** A postura precisa entrar na chave da
> testemunha **antes** do detector de escada, e não depois: sem ela, a linha `sabretooth | wound`
> de `picture` junta o nível `819` do Protector com os `927–973` do Blood Rage, e o conjunto não
> cai em grade nenhuma (`927/819 = 1,1319`; com degrau de `2%` o encaixe erra por `6,7` pontos,
> muito além da folga de `1`). A escada só é visível depois da separação por postura. A fatia da
> postura passa a ser a **2** e a da escada a **3**; o vermelho intermediário do `mammal +3,0%`
> continua sendo a prova de que a primeira não pode ser entregue sozinha.

## Alvos (exaustivo)

Esta change não muda a classificação de nenhum turno — ela corrige **fatos de setup de sessão**.
Por isso os alvos são asserts em `tests/*.test.mjs`, não casos de gabarito (`tools/gabarito-unified.mjs`
fica em **231** e o contrato de `tests/unified-experimental-coverage.test.mjs` não muda).

Formato: `Como <fixture> S<N>, quero <fato de setup>, porque <evidência>`.

1. Como `picture` S0, quero **omega inativo**, porque a linha `sabretooth | wound charm` tem os
   níveis `927 · 936 · 954 · 973` — quatro degraus de `1%` (`n = 0, 1, 3, 5` sobre a grade a
   partir de `927`, resíduos `0,27` / `0,81` / `0,35`) — e o span `1,0496` fica abaixo do teto
   `×1,09` que o Combat Mastery sozinho alcança com degrau de `1%`. Hoje o motor crava omega por
   `973 / 927 = 1,0496` cair na janela de tolerância de `1,06` (`[970,3 ; 995,0]`). (`M-042`)
2. Como `crypt` S0, quero **omega ativo**, porque `cyclursus | zap charm` tem exatamente dois
   níveis (`659 ×124` e `699 ×35`, razão `1,0607`) e duas populações não são escada; e porque o
   terceiro nível de `crypt mage | freeze charm` (`1098`, razão `1,6511` sobre `665`) não cai em
   nenhuma grade nem em nenhum teto, logo é contaminação e não transforma a linha em escada.
   (`M-039` intacta)
3. Como `tom` S0 e `tom 2` S0, quero a **escada reconhecida com degrau de `2%`** (oito níveis de
   `835` a `935`, span `1,1198`/`1,1196`, dentro do teto `×1,18` de arma de duas mãos) e o
   resultado da sessão **idêntico**, porque a linha é de `overpower charm` e nunca ancora
   (`no_anchored_charm_witness_row`), e a classe delas fica indeterminada pelo teto (alvo 6). (`M-042`)
4. Como `picture` S0, quero as testemunhas de charm **separadas por postura**, com o previsto do
   Protector multiplicado por `0,85`, porque `gorerilla | freeze | Protector` observa `728` e a
   fórmula prevê `856,6 × 0,85 = 728,1`; `hulking prehemoth | divine wrath | Protector` observa
   `971` contra `971,1`; `gore horn | enflame | Protector` observa `928` contra `928,9`. Hoje as
   linhas misturam posturas e só `2` das `5` ancoram. (`M-041` emendada)
5. Como `picture` S0, quero as classes `mammal`, `reptile` e `giant` **sem bônus, por prova**,
   porque os tetos das linhas (`0,9990` · `0,9999` · `1,0001` em `mammal`; `1,0095` · `1,0191`
   em `reptile`; `0,9995` · `0,9999` em `giant`) ficam abaixo do menor candidato da grade
   (`+2%`) e o Combat Mastery só soma. Sem a regra do teto, o alvo 4 sozinho infere
   `mammal +3,0%` pela mediana, ou `reptile +2,0%` pelo menor nível com a tolerância larga —
   dois falsos, ambos medidos. (`M-042`)
6. Como `tom` S0 e `tom 2` S0, quero a classe `human` **abstendo** (doze candidatos sobrevivem ao
   teto `1,411`), porque a única linha é de `overpower charm`, que escala com a vida do
   personagem e nunca fecha a fórmula. Hoje as duas dão `bonus: 0` por inconclusividade — o
   número final não muda, o motivo passa a ser correto. (`M-042`)
6a. Como `picture` S0, quero `bmPierce` continuar em **`0`**, porque o motor já o crava por
   `not_paladin`; sob o teto, `C-012a` passa de `null` para `0` e o resultado final é o mesmo. O
   alvo é de **não-regressão**: qualquer valor diferente de `0` muda toda reversão da sessão.
   (`M-042`, `C-012a`)
7. Como sessão **sintética** de knight com escada de degrau `1%` **e** um nível a `×1,1236` do
   ancorado (`(1 + 0,01×6) × 1,06`, acima do teto `×1,09` e sobre a grade estendida), quero
   **omega confirmado**, porque nenhum nível do Combat Mastery, com nenhuma arma, alcança essa
   razão. Caminho declarado, sem caso no corpus. (`M-042`)

## 1. Prefactor — baseline aceito e raio confirmado (bloqueia 2, 3 e 4)

- [x] 1.1 Confirmar que o `latest` corresponde ao motor e aos logs: `node tools/query-unified-dump.mjs --verify-source` (esperado exit `0`). Se der exit `3`, **PARAR** e avisar o usuário antes de gerar fotografia nova — um baseline gerado com o código novo não é baseline.
- [x] 1.2 Registrar as falhas pré-existentes rodando `node tools/run-unified-checks.mjs` e guardando a saída (`before-checks.txt`). Esperado: `42/47` alvos, gabarito `231/231`, invariantes `40/41` (falha declarada `bakradrone 09:57:20`), e as 5 falhas conhecidas do `CLAUDE.md`.
- [x] 1.3 Confirmar o raio por **casamento exato**, não por substring: os fixtures alcançados são os que têm linha de charm com `hitpoints` conhecido e/ou cast exato de postura. Reconfirmar com `node tools/proto-charm-ladder.mjs` que as únicas sessões com `≥3` níveis são `picture` S0, `tom` S0, `tom 2` S0 e `crypt` S0, e que só `crypt` e `picture` têm omega ativo hoje.
- [x] 1.4 Gerar o dump de escopo **antes** de qualquer edição em `js/`: `node tools/dump-unified.mjs --pairs "picture" --pairs "crypt" --pairs "tom" --pairs "tom 2" --pairs "ek boss" > before-scoped.txt` (confirmar a sintaxe de `--pairs` lendo o parsing de `process.argv` do arquivo antes de usar). Nenhuma edição em `js/` enquanto um dump ou `run-unified-checks` estiver rodando.

## 2. Detector de escada e teto superior do omega (alvos 1, 2, 3)

- [x] 2.1 Escrever `tests/unified-combat-mastery-ladder.test.mjs` com os alvos 1, 2 e 3, no padrão de `tests/unified-omega-perk-detection.test.mjs`: valores esperados vindos da **evidência do log e da fórmula de `M-036`**, recomputados no teste a partir da tabela de mobs, nunca da saída do motor. Asserts: `picture` S0 `omegaSetup.active === false` com `source` nomeando a escada; `crypt` S0 `omegaSetup.active === true`; `tom`/`tom 2` com escada reconhecida em degrau `0,02` e omega inativo.
- [x] 2.2 Rodar `node tools/run-unified-checks.mjs --tests --match "combat-mastery-ladder"` e **ver o vermelho**. Confirmar pelo output que o caso foi selecionado (comando que seleciona zero casos não é validação).
- [x] 2.3 Declarar as constantes do perk em `js/unified-formulas.js`: degraus candidatos `{0,01; 0,02}`, máximo de degraus `9` (derivado de `+1%` por `10%` de vida faltante no nível 3) e a tolerância de encaixe na grade (`±1` ponto de dano, constante nova derivada de medição — NÃO é a folga de `S-004c`, que mede outra quantidade). Exportar em `UnifiedFormulas`.
- [x] 2.4 Implementar `inferCombatMasteryLadder(serverFacts, context)` em `js/unified-classification-engine.js`, consumindo **apenas** eventos de charm, janelas de `utevo grav san` e a linha do tempo de postura — sem tabela de mobs, sem `pierce`, sem classificação. Posicionar em `buildContext` logo depois de `stanceSetup`/`gravSanSetup` e **antes** de `inferBestiaryClassDamageBonus`/`inferOmegaPerk`.
- [x] 2.5 Ligar o detector em `inferOmegaPerk` (a função canônica de `M-039`, sem alterar seu texto): com escada, a busca por nível a `×1,06` do ancorado é substituída pela busca acima do teto sobre a grade estendida `(1 + s·n) × 1,06`. Sem escada, o caminho atual roda sem nenhuma alteração.
- [x] 2.6 Rodar de novo e **ver o verde**. Depois `node tools/dump-unified.mjs --pairs "picture" --pairs "crypt" --pairs "tom" --pairs "tom 2" > after-scoped-2.txt` e comparar com `before-scoped.txt`: esperado **zero** linhas de diferença (o selo de omega não rotula hit nenhum da partição vencedora de `picture`).

## 3. Postura no estado do proc + regra do teto (alvos 4, 5, 6, 6a)

- [x] 3.1 Escrever `tests/unified-charm-witness-knight-stance.test.mjs` com os alvos 4, 5, 6 e 6a: as linhas-testemunha de `picture` separadas por postura; o previsto do Protector igual a `hitpoints × 0,05 × mitigação × effectiveMod × 0,85`, recomputado no teste a partir da tabela de mobs; as três classes de `picture` sem bônus **por prova** (não por inconclusividade), com os tetos citados; `human` abstendo em `tom`/`tom 2`; `bmPierce === 0` em `picture`. Asserts de não-regressão para `crypt`.
- [x] 3.2 Rodar o filtro correspondente e **ver o vermelho** (hoje a postura não entra na chave, então o previsto do Protector não bate e as linhas não se separam).
- [x] 3.3 Somar a postura à chave de agrupamento e o `0,85` ao valor previsto nas **três** leituras: `inferOmegaPerk` (`M-039`), `inferBestiaryClassDamageBonus` (`M-036`) e `inferBmPierceFromCharmDamage` (`C-012a`). O `charmProbeContext` que `classifyUnified` monta para `C-012a` já carrega `stanceSetup`; garantir que ele carregue também a escada.
- [x] 3.4 **Verificar o vermelho intermediário** exigido pelo design (D3): com 3.3 aplicada e a regra do teto ainda ausente, `picture` passa a inferir `mammal +3,0%`. Registrar essa medição — ela é a prova de que a correção da postura não pode ser entregue sozinha.
- [x] 3.5 Implementar a regra do teto sob escada em `M-036` e `C-012a`: candidato eliminado quando `previsto × (1 + b) > menorNível + 1`; veredito da classe pela interseção dos sobreviventes (vazio ⇒ sem bônus provado, um ⇒ esse bônus, mais de um ⇒ abstém), com motivo no diagnóstico (`U-006`). O caminho sem escada fica **intocado**, com a tolerância larga de `M-036` como está. **Ver o verde**.
- [x] 3.6 Diff de escopo de novo (`after-scoped-3.txt` contra `before-scoped.txt`): esperado **zero** linhas de diferença nos cinco fixtures. Atenção ao caminho de `C-012a`: em `picture` ele passa de `null` para `0`, o que troca o fluxo (deixa de precisar da classificação-sonda de `C-012`) sem trocar o número — confirmar que o dump não muda.

## 4. Via do teto (alvo 7 — caminho declarado, sem caso no corpus)

- [x] 4.1 Acrescentar ao teste da fatia 2 um caso **sintético** de sessão de knight com escada de `1%` e um nível a `×1,1236` do ancorado, e assertar omega confirmado. Ver vermelho antes de 2.5 estar completa, verde depois.
- [x] 4.2 Acrescentar o caso simétrico: nível a `×1,65` do ancorado (a forma do `1098` de `crypt`) **não** confirma omega e **não** impede outra linha da mesma sessão de confirmar.

## 5. Regra normativa e baseline documentado

- [x] 5.1 Escrever `M-042` em `docs/CLASSIFICATION_RULES.md`: a mecânica do Combat Mastery, o detector de escada com os tetos **derivados** das constantes do jogo, a abstenção de sessão das três leituras, a via do teto para omega, e a limitação declarada (dano base com `+0` a `+6%`, precedente `M-037`). O discriminador fica escrito **dentro** de `M-042`; o texto de `M-039` não é tocado.
- [x] 5.2 Emendar `M-041` com a cláusula da testemunha de charm: a postura entra no estado do proc e o Protector multiplica o previsto por `0,85`, nas três leituras. Citar os pares medidos (`728` vs `728,1`; `971` vs `971,1`; `928` vs `928,9`).
- [x] 5.3 Atualizar o baseline do `CLAUDE.md` com os números medidos desta change (alvos, gabarito, invariantes, turnos do dump, drift) e o raio (4 sessões com escada, 1 sessão com setup alterado).

## 6. Validação, review e gate humano

- [x] 6.1 Corpus completo: `node tools/gabarito-unified.mjs`, `node tools/run-unified-checks.mjs`, `node tools/dump-unified.mjs --write-candidate`, e `diff reports/unified-dump/latest/dump-unified.txt reports/unified-dump/candidate/dump-unified.txt > diff-unified.txt`. Critério: **não piorar** contra `before-checks.txt` — as mesmas falhas de antes, nenhuma nova. Rodar em background e esperar a notificação.
- [x] 6.2 Confirmar que `tools/gabarito-unified.mjs` continua em **231** casos e que `tests/unified-experimental-coverage.test.mjs` não precisa de atualização. Se algum caso for adicionado, atualizar o contrato no mesmo commit.
- [x] 6.3 `mattpocock-skills:code-review` nos dois eixos (Standards e Spec), com o ponto fixo do início da mudança, e apresentar os dois relatórios separados.
- [x] 6.4 `node tools/diag-changed-turns.mjs --diff diff-unified.txt > reports/model-combat-mastery-ladder-review.txt` e apresentar a lista completa nos três grupos (alvos, colaterais explicados, colaterais suspeitos). Se o diff for vazio, apresentar a evidência de que é vazio e o diff de **setup** de `picture` (omega, bônus de classe, linhas de testemunha) no lugar.
- [x] 6.5 **GATE DE APROVAÇÃO HUMANA:** parar e esperar decisão explícita do usuário sobre todo turno alterado e sobre a mudança de setup de `picture`. Silêncio, teste verde ou categorização automática não valem como aprovação.

## 7. Fechamento

- [x] 7.1 Apagar os protótipos joga-fora: `tools/proto-charm-ladder.mjs`, `tools/proto-m036-with-stance.mjs`, `tools/proto-c012a-probe.mjs`. Manter `reports/proto-charm-ladder-corpus.txt` como evidência da varredura de raio.
- [x] 7.2 Arquivar com `openspec-archive-change` e promover o candidate aceito sem reclassificar: `node tools/dump-unified.mjs --promote-candidate`.
