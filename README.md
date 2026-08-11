# Classificador (Tibia)

Página única que cruza um **server log** + um **local chat** da mesma hunt e mostra
**quanto cada componente da rotação realmente fez**: turnos, hits médios, dano base e dano
efetivo por componente/spell. **Não há simulação** — só leitura dos dois logs.

O local chat é o que diz qual spell foi lançada em cada turno, e é isso que permite separar
o componente "spell" por incantação (ex.: `Divine Caldera`) em vez de somar tudo num balde só.

Funciona para todas as vocações.

## Como usar

**https://lucasporfz.github.io/classificador/**

1. Carregue ou cole o **server log** e o **local chat** da mesma hunt.
2. Se os arquivos contiverem várias hunts, escolha o **par de sessões** no seletor (o
   pareamento é automático por dia e horário de save).
3. Clique em **classificar**.

## O que a página mostra

**Tabela de rotação** — uma linha por componente/spell:

| coluna | o que é |
| --- | --- |
| componente | Auto ataque, cada spell por incantação, runa, granada |
| turnos | em quantos turnos alinhados aquele componente apareceu |
| hits méd | hits por turno |
| hits médios ajustados (grav san) | hits por turno corrigidos pelo ganho do tapete |
| dano médio sem crítico | dano base, com crítico/Onslaught/prey revertidos |
| dano médio com crítico | dano efetivo observado |

Componentes com mecânica em estágios aparecem quebrados em faixas próprias — *sem bônus* /
*com bônus*, *primeira* / *segunda explosão* (death echo), *central* / *lateral* (beam),
*Stage 1/2/3*.

**Grav san** — quando `utevo grav san` é confirmado na sessão, sai uma segunda tabela só
com o que caiu em cima do tapete, mais uptime e bônus de dano.

**Uptime** — AA uptime e Spell/rune/granada uptime (perdidos, acertados, % e por hora).

**Gráficos do log** — componentes por turno, hits/turno, dano/turno, Impact Analyser e um
histograma por componente. Clicar em qualquer ponto abre o **detalhe do turno**, hit a hit,
com navegação anterior/próximo.

Turnos que não alinham 100% entre os dois logs (cast fora da janela, ou fora da cobertura do
local chat) são **excluídos e contados** no rodapé — não entram na média silenciosamente.
