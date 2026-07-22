# Classificador (Tibia)

Página única que cruza um **server log** + um **local chat** da mesma hunt e produz
uma **tabela de rotação** por componente/spell: **turnos, hits médios, dano base, dano
efetivo** — além de gráficos do log (componentes por turno, hits/turno, dano/turno,
Impact Analyser e histograma por componente). **Não há simulação**: só leitura dos dois
logs.

Funciona para todas as vocações (RP e EK validados; mage/druid/monk pela mesma mecânica).

## Como usar

Abra `index.html` num servidor estático (o Chart.js vem de CDN). Cole o server log e o
local chat da mesma hunt e clique em **classificar**.

```
# qualquer servidor estático, ex.:
npx serve .
# ou a extensão Live Server do VS Code
```

## Como funciona (resumo)

O projeto tem **um único motor de classificação**, o Unified, carregado por `index.html` na
ordem abaixo:

- **`js/unified-parsing.js`** — fatos observados: hits, casts, `Using` de runa, leech, charms
  e modificadores; formação dos turnos de 2 segundos.
- **`js/unified-formulas.js`** — reversão discreta de dano (elemental e físico), `effectiveMod`
  por pierce/Expose Weakness, fórmulas de leech.
- **`js/unified-setup-inference.js`** — inferência por sessão: taxa de leech, minor charms,
  BM/Battle Momentum, `utevo grav san`, multiplicador de crítico.
- **`js/unified-validation.js`** — validação de partição candidata: interseções, crit-state,
  cardinalidade por leech, homogeneidade.
- **`js/unified-turn-resolution.js`** — enumeração de cortes, escolha da partição e nomeação.
- **`js/unified-classification-engine.js`** / **`js/unified-main.js`** — orquestração e a API
  consumida pela UI.

## Teste / oráculo

```
node tools/diag-unified-turn.mjs "logs/<server>.txt" "logs/<localchat>.txt" HH:MM:SS
```

Diagnóstico canônico de turno: roda o Unified com as **mesmas opções da UI** e mostra status,
hits com evidência física/elemental e as violações de cada partição rejeitada. Use
`--session N` para mirar uma sessão específica por índice.

Validação obrigatória depois de qualquer mudança no classificador:

```
node tools/run-unified-checks.mjs
```

Fixtures em `logs/` cobrem: RP pack (`server log rp` + `localchat rp`), RP party
(`darklight …`), RP boss single-target (`murcion …`), EK packs (`bastion …`,
`night harpy …`) e druid (`uhax …`).
