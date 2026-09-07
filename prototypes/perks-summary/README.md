# PROTOTYPE — resumo de perks e charms

Pergunta: qual hierarquia torna os perks inferidos e os charms mais fáceis de ler, sem confundir taxa base com bônus condicional?

Quatro variantes na página real do classificador, trocadas por `?variant=A|B|C|D` e pela barra flutuante. Exemplos reais: `?sample=uhax|picture|ingol`. A classificação acontece em memória, uma vez por exemplo, sem dump ou persistência. Nenhum arquivo de produção importa este protótipo; apenas o servidor abaixo injeta os arquivos na página existente.

Execute da raiz:

```sh
node prototypes/perks-summary/serve.prototype.mjs
```

Abra http://localhost:4187/?variant=A&sample=uhax

- A — Ficha de equipamento: recuperação e perks lado a lado; charms observados abaixo.
- B — Por criatura: tabela única de associação de charms, separando vida e mana por coluna.
- C — Resumo compacto: indicadores fixos e navegação por assunto para abrir detalhes.

Setas esquerda/direita alternam variantes, exceto durante edição/seleção. O seletor de exemplo mantém a variante. Todo dado relevante pode ser inspecionado em “Dados usados nesta proposta”. A interface experimental está em português.

Estado da decisão: opção D aprovada. Preserva a aparência atual, concentra os minor charms em uma coluna da tabela Criaturas, remove seus bônus numéricos e o cartão Charms equipados, e identifica o mob do Bounty sem quebras desnecessárias. A versão definitiva foi integrada à UI; este protótipo é preservado separadamente na branch codex/prototype-perks-summary. A captura D.png registra a proposta antes da remoção final do cartão duplicado.
