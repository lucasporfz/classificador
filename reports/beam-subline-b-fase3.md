# Change B — sub-linhas do beam de sorcerer — Fase 3 (protótipo)

Data: 27/Set/2026. Motor medido: cópia de `js/` do HEAD `15d0db7` fora do repo, recriada por
`PROTO_DIR=<pasta> node reports/beam-subline-b-fase3/apply-proto-b.mjs`. Nada em `js/` do repo foi
editado.

Sondas em `reports/beam-subline-b-fase3/`:
- `proto-diff-b.mjs`: diff turno a turno e hit a hit contra o repo;
- `proto-turn-b.mjs`: um turno nos dois motores, mais o veredito do validador de beam com cada peça
  desligada;
- `debug-levelcheck.mjs`: quais overkills falham na verificação de nível;
- `categorize-diff.mjs`: classifica as mudanças do diff por tipo;
- `ablation-*.txt`: o comando vermelho da Fase 2 com cada peça desligada.

## O que o protótipo faz (todas as peças atrás do validador de beam)

1. **Elemento do beam pela máquina de M-043.** `converted` → [estância, nativo], `arm`/`rearm` →
   [estância], `native`/`unknown` → [nativo, estância], com o segundo só como último recurso.
   Pré-cutoff: nativo. Estância desconhecida: busca livre, com spread primeiro e o perfil no empate.
   O bloco genérico de um beam que não fecha também usa o primeiro elemento da máquina.
2. **Stage da sessão.** Novo campo no `SessionSetup`. É a unanimidade entre os beams validados na
   passada sem leech (os que só um stage explica); sem essa unanimidade, o stage fica desconhecido e
   os três são admitidos. Entra antes da passada final, no mesmo ponto do eixo de AA.
3. **M-035b.** Um overkill com leech provadamente não-capado dá um intervalo de dano real e, daí, de
   original.
   - A prova é P1 ∪ P2': vida e mana dão o mesmo dano real, ou todo hit seguinte do golpe ainda ganha
     o canal.
   - O intervalo leva a tolerância de leech de D-024, e o N conta os hits virtuais de charm-kill do
     bloco (S-014e).
   - **Forma A:** quando as âncoras formam um nível só, todas são laterais, e o central sai dos
     overkills provados do mesmo estado de crítico.
   - **Nível:** todo overkill provado tem de cair no nível da sua sub-linha.
4. **Piso.** O dano exibido e o leech observado só podem subestimar o dano real (D-011/D-025, V-014).
   Um overkill cujo piso já passa do nível de uma sub-linha não pode estar nela. Não precisa de prova
   de não-capado.
5. **Leech esparso.** A sub-linha aceita ≥1 confirmação e 0 contradição, como a spell concreta
   (V27).

6. **Trava de perda de recurso na P2' (v5).** A P2' só vale se nenhuma perda do mesmo recurso
   aparece no server log entre o overkill e os hits seguintes. Pode ser dano recebido na vida ou
   perda de mana pelo magic shield, e em qualquer dos casos a reserva pode ter esvaziado no meio.
   O parser passa a anotar, em cada evento, quantas perdas de vida e de mana vieram antes dele.
   Medido: há 61 perdas de vida entre hits do mesmo segundo em `alumnishocks 2` e 1 de mana em
   `death echo`. A trava não muda nenhum turno do corpus (diff v5 idêntico ao v4), mas sem ela a
   prova seria falsa nesse cenário.

A comparação de nível só usa âncoras do **mesmo estado** de crítico, Low Blow, Savage Blow e
Onslaught. Entre estados diferentes a reversão depende do multiplicador de crítico inferido, e o
Savage Blow nem tem normalização (D-008a).

## Resultados

- Números abaixo são da v4 e ficam iguais na v5 (`probe-b-proto5.txt`, `diff-v5-post.txt`,
  `diff-v5-controls.txt`).
- **Alvos:** `probe-b.mjs` passa de 17 vermelhos para **0** (`probe-b-proto4.txt`). Guardas
  intactas: `kim` 16:15:56 `A0 S7` sem rótulo; `Mrowdy 2`/`ms boss` 17:16:37 `A1 S5` sem rótulo.
- **Controles** (`Mrowdy`, `Mrowdy 2`, `ms boss`, `uhax 3`, `ingol ed`, `barrage`): 45 sessões e
  5.445 turnos, **zero** mudança (`diff-v4-controls.txt`).
- **Sorcerer pós-cutoff** (9 sessões, 1.395 turnos): **zero** mudança de contagem ou status, 69
  turnos com mudança só de rótulo, elemento ou stage, e 1 só de resolver (`diff-v4-post.txt`,
  categorias em `diff-v4-categorias.txt`):

| categoria | turnos | leitura |
|---|---|---|
| alvo | 17 | como o esperado da Fase 1 |
| overkill ganha rótulo num beam que já validava | 30 | nível pelo leech ou pelo piso; em 3 deles é carimbo em AA (ver abaixo) |
| beam passa a validar | 18 | 8 são carimbos órfãos da Fase 2, agora provados e com rótulos iguais (`kim` 16:19:24 e 16:21:24; `dlc ms` S0 21:42:38, 21:43:03, 21:43:41, 21:44:49 e 21:45:37; S1 22:00:15); os outros 10 ganham rótulo |
| rótulo troca | 3 | `kim` 16:25:08, `dlc ms` S0 21:36:07, S1 21:58:41: o overkill vai para o nível do leech dele |
| perde rótulo | 1 | `dlc ms` S0 21:35:10 (`2990 OK`, `6432 OK`): ambiguidade real |
| só resolver | 1 | `dlc ms` S0 21:37:37: continua `A0 S11` |

- **Resolver** (402 beams, `sweep-beams-proto5.tsv` × `../beam-subline-b-fase2/sweep-beams-head.tsv`):
  nenhum turno A1 muda. 20 turnos trocam de motivo entre ramos de A0: 17 passam a A0 "pelo beam
  validado", e 3 vão ao default porque o teste do turno inteiro não vê o hit virtual (`dlc ms` S0
  21:37:37, S1 21:54:37 e `kim` 16:25:08).
- **Stage por sessão:** unânime nas 9 sessões (stage 1 nas duas do Alumni Shocks, 3 nas outras).
  Desligá-lo não muda **nenhum** turno: com o elemento restrito, cada beam só fecha num stage.

## Ablações (qual alvo fica vermelho sem cada peça)

| peça desligada | alvos vermelhos | hipótese |
|---|---|---|
| elemento (1) | os 4 de elemento + 18:31:58 | necessária |
| stage (2) | nenhum | sem efeito medido (H2: sem coincidência de stage no corpus) |
| M-035b inteira (3) | 12, e 18:31:29 vira `A0 S7` | confirma H1: elemento e M-035b andam juntos |
| só a verificação de nível (3) | `aquatic` S2 13:05:51, 18:25:16, `aquatic` S0 10:44:32 | confirma H3 |
| P2' (só P1) | 18:31:42, 18:27:45, 18:28:09 | confirma H4 |
| piso (4) | nenhum alvo; volta a tirar rótulo certo de 7 colaterais | ver abaixo |
| leech esparso (5) | `dlc ms` S0 21:44:27 | confirma H5 |

## Achados que viram texto de regra

- **A verificação de nível tem de respeitar o estado de crítico.** Na v1, dois beams do `aquatic` S0
  (10:44:52, 10:45:14) perdiam a validação: overkill crítico com Low Blow comparado com âncora
  não-crítica, e overkill sem Savage Blow comparado com âncora com Savage Blow.
- **O N da sub-linha conta o hit virtual de charm-kill.** `dlc ms` S0 21:37:37 e S1 21:54:37: com N
  sem o virtual, o dano real sai ~6% baixo e o nível não fecha.
- **O leech esparso sozinho apagava 15 rótulos, e parte deles estava certa.** Sem ele, uma
  sub-linha com 1 confirmação era reprovada e uma com 0 confirmação passava como neutra; os rótulos
  antigos vinham dessa distorção. O piso devolve os que têm prova. Exemplos:
  - `kim` 16:15:34: `1856 OK` tem piso de 1537 contra o lateral de 1500, logo é central;
  - `dlc ms` S1 21:52:37: `6144 OK` tem piso de 2666 contra o lateral de 2055;
  - `dlc ms` S1 21:58:41: `3599 OK` tem piso de 3666 contra 2709.

  Sobra uma perda real: `dlc ms` 21:35:10, onde central 4 e lateral 9 fecham com `2990 OK`, `6432 OK`
  ou o virtual no central.
- **O teste do turno inteiro (linha 340) não enxerga os hits virtuais**, que só entram no componente.
  Efeito medido: 1 resolver (`dlc ms` 21:37:37), 0 contagens.
- **Carimbo em AA continua acontecendo** quando o turno inteiro fecha com o AA dentro de uma lateral
  (`alumnishocks` 19:01:14, `alumnishocks 2` 18:27:38 e 18:31:50). A decisão A1 vem da fronteira de
  tempo, acima na escada, e a classificação do beam não muda. Por decisão do usuário, é indiferente.

## Pendências declaradas (fora da B)

- `kim` 16:14:08, 16:18:55, 16:23:43 e 16:25:31 continuam com rótulo órfão. Nos hits com dano, os
  rótulos estão certos (a fração bate stage 3), mas um dodge de dano 0 na janela não cabe na
  cardinalidade de nenhuma sub-linha: é provavelmente o AA que errou (V-018a, change C).
- `alumnishocks 2` 18:24:35 (`A0` + beam 7, AA absorvido): change C.
