-- Ranking: posição por métrica e score geral. RASCUNHO, não aplicado.
-- Só jogabilidade entra (decisão: sem placar de poder). Dano e maior hit são exibidos pelo
-- cliente a partir do resumo, sem rank/percentil/tier.
--
-- p_scope: 'hunt' | 'hunt_level' (faixas de 250 níveis: 750–1000, 1000–1250…) | 'vocation'.
-- Todos os escopos comparam só a mesma vocação.
-- p_best:  false = "All sessions" (cada sessão é uma entrada; as outras sessões do próprio
--          jogador também concorrem). true = "Best of each player" (o melhor de cada outro
--          jogador; o melhor do próprio jogador entra como mais um concorrente se for de outra
--          sessão e maior que o valor da sessão escolhida).
-- Regras: rank = 1 + quantos têm valor maior; percentil = (abaixo + 0,5 × empatados) ÷ outros;
-- rank só com 3+ jogadores no grupo; tier e percentil só confirmados com 30+ (antes: provisional).
-- Tier por "top X%": S ≤5, A ≤10, B ≤50, C ≤90, D resto.
-- Métricas: aa (só com aa_pct >= 10), cast, carpet (só paladin), hits (componentes com >= 10 turnos).

create function ranking_standing(p_session uuid, p_scope text, p_best boolean default false)
returns table (
  metric text, label text, value numeric, rank int, players int,
  percentile numeric, top_pct numeric, tier text, provisional boolean
)
language sql stable security definer set search_path = public as $$
  with me as (select * from ranking_sessions where id = p_session),
  grp as (
    select s.* from ranking_sessions s, me
    where s.status <> 'rejected' and s.vocation = me.vocation
      and (p_scope = 'vocation' or s.hunt = me.hunt)
      and (p_scope <> 'hunt_level' or floor(s.level / 250) = floor(me.level / 250))
  ),
  entries as (
    select id as sid, player_id, 'aa'::text as metric, ''::text as label, aa_per_hour as v from grp where aa_pct >= 10
    union all select id, player_id, 'cast', '', spell_rune_per_hour from grp
    union all select id, player_id, 'carpet', '', gravsan_used::numeric / gravsan_den
      from grp where vocation = 'paladin' and gravsan_den > 0
    union all select g.id, g.player_id, 'hits', c.kind || '|' || c.label, c.hits_adj
      from grp g join ranking_session_components c on c.session_id = g.id where c.turns >= 10
  ),
  mine as (select metric, label, v from entries where sid = p_session),
  comp as (
    select m.metric, m.label, e.player_id, e.v from mine m join entries e using (metric, label)
      where not p_best and e.sid <> p_session
    union all
    select m.metric, m.label, e.player_id, max(e.v) from mine m join entries e using (metric, label)
      where p_best and e.player_id <> (select player_id from me)
      group by m.metric, m.label, e.player_id
    union all
    select m.metric, m.label, e.player_id, max(e.v) from mine m join entries e using (metric, label)
      where p_best and e.player_id = (select player_id from me) and e.sid <> p_session
      group by m.metric, m.label, e.player_id, m.v having max(e.v) > m.v
  ),
  agg as (
    select m.metric, m.label, m.v as value,
      count(c.v) as others,
      count(*) filter (where c.v > m.v) as above,
      count(*) filter (where c.v = m.v) as ties,
      count(*) filter (where c.v < m.v) as below,
      count(distinct c.player_id) + case when bool_or(c.player_id = (select player_id from me)) then 0 else 1 end as players
    from mine m left join comp c using (metric, label)
    group by m.metric, m.label, m.v
  ),
  pct as (
    select *, case when others > 0 then (below + 0.5 * ties) / others end as percentile from agg
  )
  select metric, label, value,
    case when players >= 3 then (1 + above)::int end,
    players::int,
    round(percentile, 4),
    round((1 - percentile) * 100, 2),
    case when percentile is null then null
         when (1 - percentile) * 100 <= 5 then 'S' when (1 - percentile) * 100 <= 10 then 'A'
         when (1 - percentile) * 100 <= 50 then 'B' when (1 - percentile) * 100 <= 90 then 'C' else 'D' end,
    players < 30
  from pct
  order by metric, label
$$;

-- Score geral (0–100): média dos percentis ponderada pelo tier de cada métrica (S×8, A×5, B×3, C×2, D×1).
create function ranking_score(p_session uuid, p_scope text, p_best boolean default false)
returns table (score numeric, metrics int, provisional boolean)
language sql stable security definer set search_path = public as $$
  select round(100 * sum(percentile * w) / nullif(sum(w), 0), 1), count(*)::int, bool_or(provisional)
  from (
    select percentile, provisional,
      case tier when 'S' then 8 when 'A' then 5 when 'B' then 3 when 'C' then 2 else 1 end as w
    from ranking_standing(p_session, p_scope, p_best) where percentile is not null
  ) t
$$;

-- As funções são security definer e leem tabelas sem política de leitura; devolvem só números.
revoke all on function ranking_standing, ranking_score from public;
grant execute on function ranking_standing, ranking_score to anon, authenticated;
