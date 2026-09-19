## Context

Em `drone ingol` S0, `inferBestiaryClassDamageBonus` cria uma unica linha para `liodile | holy` e interpreta a razao como `humanoid +2%`. Como holy tambem recebe BM, a linha mede o produto de duas causas e nao identifica nenhuma isoladamente. Com esse falso setup, 64/189 turnos ficam unresolved; neutralizar apenas o perk reduz para 1/189.

Todos os 47 charms marcados por Bounty sao `overpower charm`, que D-010g/C-012a proibe usar como testemunha. A evidencia restante sao componentes deterministas de Divine Caldera e Divine Barrage. O coletor ja exige controles nao marcados puros, mas a pontuacao volta a intersectar controles e marcados como se todos fossem igualmente ancoras.

## Goals / Non-Goals

**Goals:**

- Abster do perk de classe quando BM e classe nao sao identificaveis separadamente.
- Usar Caldera/Barrage como fallback D-010g sem permitir que o candidato crie sua propria evidencia.
- Inferir Bounty somente se houver vencedor unico, com pelo menos um ajuste e zero contradicoes.
- Travar o comportamento em teste e gabarito de `drone ingol`.

**Non-Goals:**

- Usar `overpower charm` para inferir dano de Bounty ou BM.
- Criar limiar, constante ou excecao por fixture, vocacao, mob ou spell.
- Alterar UI, parser, tabela de mobs ou tolerancias de reconstrucao.

## Decisions

### 1. Linhas BM-sensitive nao medem classe sozinhas

Dentro de `inferBestiaryClassDamageBonus`, linhas `holy`/`physical` so podem participar da decisao de classe quando a classe possui ao menos uma linha de elemento imune a BM (`fire`, `ice`, `death`, `earth`, `energy`) que mede o multiplicador independentemente. Sem essa ancora, as linhas continuam disponiveis no diagnostico, mas nao votam no perk. Isso implementa diretamente M-036/C-012a e nao adiciona um detector concorrente.

Alternativa rejeitada: exigir duas linhas holy/physical. Duas medicoes do mesmo produto continuam sem separar BM de classe; repeticao melhora precisao, nao identificabilidade.

### 2. Controles definem a ancora do fallback de Bounty

`inferBountyDamageFromFrozenComponents` calcula, sem candidato, a intersecao dos originais somente dos hits nao marcados. Depois, para cada nivel oficial, reverte cada hit marcado e exige que ele seja compativel com a ancora dos controles. Um hit marcado sem original conhecido nao contradiz nem confirma; componentes sem nenhum marcado utilizavel nao votam.

O veredito permanece conservador: candidato aceito apenas com `fits >= 1`, `contradictions = 0` e sem outro candidato de zero contradicoes. `ranked` permanece diagnostico.

Alternativa rejeitada: intersectar todos os hits de uma vez. Isso faz a ausencia de original no lado marcado apagar uma ancora independente ja provada pelos controles, contrariando D-010g.

### 3. Um teste de setup e um turno curado fecham a regressao

O teste de setup prova que `drone ingol` nao infere `humanoid +2%` e registra o veredito de Bounty produzido pelas evidencias deterministas. O gabarito recebe um turno cujo resultado foi revisado por diagnostico hit-a-hit, sem copiar a saida do motor como esperado.

## Risks / Trade-offs

- [Sessoes antigas dependiam de linha holy/physical unica para perk de classe] -> comparar dump completo; qualquer drift fora de classes sem ancora imune exige revisao, nao tolerancia nova.
- [Os componentes deterministas podem nao discriminar um nivel de Bounty] -> preservar `unknown`; a mudanca nao promete nivel quando a evidencia nao fecha.
- [Hit marcado desconhecido pode reduzir evidencia] -> ele abstém; nunca vira ajuste nem contradicao.
