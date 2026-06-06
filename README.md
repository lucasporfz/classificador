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

- **`js/classifier-parser.js`** (`parseLogForClassifier`) — parse próprio do classificador:
  sem guard de tamanho mínimo (lê boss de 1 kill), artigo `A/An/The` opcional.
- **`js/classifier.js`** — tabela `CLS_SPELLS` (toda spell de todas as vocações), detecção
  do jogador, join server↔local chat por timestamp e a montagem da rotação. Split mecânico
  por ordem: **AA single-target primeiro, depois AoE (spell/runa)**; em pack RP usa o
  classificador por bandas de dano holy.
- **`js/parser-rp-helpers.js`** — classificação RP compartilhada (arrow/spell/runa/granada
  por assinatura de dano holy). Mesma lógica validada do app original.

## Teste / oráculo

```
node tools/rp-classify-proto.mjs "logs/<server>.txt" "logs/<localchat>.txt"
```

Imprime a tabela de rotação + detecção das incantações. Filtros opcionais
`--spell "<incantação|label>"` e `--hits N` imprimem, hit a hit, os turnos alinhados que
casam. **1 par de logs por processo.**

Fixtures em `logs/` cobrem: RP pack (`server log rp` + `localchat rp`), RP party
(`darklight …`), RP boss single-target (`murcion …`), EK packs (`bastion …`,
`night harpy …`) e druid (`uhax …`).
