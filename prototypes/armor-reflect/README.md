# PROTOTYPE — reflect da armadura do knight

Pergunta: onde e como mostrar o dano de `damage reflection` da armadura do knight no classificador?
O reflect do parry charm fica de fora.

Rode da raiz:

```sh
node prototypes/armor-reflect/serve.prototype.mjs
```

Abra http://localhost:4188/?variant=A&sample=tom. Para trocar de variante, use a barra flutuante,
as setas ← → ou `?variant=A|B|C|D`. Para trocar de amostra, use `?sample=tom|tom3|picture|bastion`.
A classificação roda em memória, no worker da UI real. Os arquivos de `index.html` e `js/`
continuam intactos.

- **A — Cartão no resumo:** um cartão "Reflect da armadura" (total, % do dano, procs, média, por hora)
  e uma coluna `reflect` na tabela de criaturas.
- **B — Linha na rotação:** o reflect aparece como uma linha própria, hachurada, na composição e na
  tabela de rotação, com a marca "fora da rotação". Não tem turnos, hits nem dano base.
- **C — Seção própria:** uma seção abaixo da rotação com métricas, uma série de reflect por minuto
  (com a % do dano do minuto) e uma tabela por criatura.

- **D — Coluna + linhas + efetivo/turno:** a coluna `reflect` na tabela de criaturas (A), a linha
  hachurada na composição e na rotação (B) e uma coluna nova na rotação, **dano médio efetivo / turno**,
  que é o dano total da linha dividido por **todos** os turnos da sessão (`res.totalTurns`). O toggle
  "Turno", que já existia, divide pelos turnos em que o componente saiu e mede outra coisa: o tamanho
  do turno daquele componente. A coluna nova mede quanto a linha contribui para um turno qualquer da
  hunt. Por isso o reflect entra na mesma régua dos componentes, e a coluna soma o dano médio por
  turno da sessão, que aparece no rodapé "Total da sessão". Exemplo em `bastion`:
  (1.571.558 + 43.664) ÷ 208 = 7.765,5, e o reflect contribui com 209,9 por turno.
  Cada cabeçalho da rotação, da composição e da tabela de criaturas tem um tooltip que explica a coluna
  (sublinhado pontilhado). O texto muda conforme o modo Hits/Turno e foi tirado do que o código
  calcula.

## Dado

- Fonte: `res.unifiedSource.facts.server.events` com `kind === 'reflect'`. O parser já tira
  `(damage reflection)` dos hits principais (C-008/D-027). O protótipo só **lê** esse dado. Nada
  entra em componente, `N_leech`, rotação, uptime ou reversão.
- O parry charm (`damage reflection, parry charm`) recebe `kind: 'charm'` no parser e, além disso,
  passa por uma guarda explícita (`/charm/`). No corpus não há parry do próprio jogador. As únicas
  linhas de parry são de outro jogador (`due to an attack by Woxinef`), e o parser nem as lê.
- Só knights têm `(damage reflection)` com `due to your attack` no corpus: `tom`, `tom 2`,
  `tom 3`, `bastion`, `night harpy` e `picture`. Nos outros logs, o reflect é de outros jogadores
  ou contra você.
- O reflect é quase constante por sessão: ≈32 em `bastion`, ≈34 em `tom` e ≈52 em `picture`. Os
  valores baixos (2–20) são reflects que **mataram** o mob (a linha seguinte é XP), com dano
  truncado.
- A "% do dano" é calculada sobre o dano do jogador (a mesma soma da composição, com o charm
  desligado) mais o reflect.

Capturas: `A-card.png`, `A-creatures.png`, `B-share.png`, `B-rotation.png`, `C-bastion.png`, `C-tom3.png`, `D-creatures.png`, `D-share.png`, `D-rotation-hit.png` e `D-rotation-turn.png`.

Estado da decisão: **D aprovada** (07/Out/2026) e integrada na UI real (`js/app.js`, `js/session-summary.js`, `js/i18n.js`, `css/style.css`). Na integração, a coluna "efetivo / turno" perdeu o slot "+N" do charm (o número não cabia), e a célula de procs do reflect passou a usar o slot da %. Este protótipo fica preservado só na branch `prototype/armor-reflect`.
