-- Ranking: o placar do hover. ranking_standing passa a devolver, junto de others_values (mesma ordem),
-- others_names (nome do personagem SÓ se o jogador marcou "mostrar meu nome"; senão nulo) e others_me
-- (true = outra sessão do próprio jogador). Anônimo continua anônimo: o nome nunca sai sem o opt-in.
-- Mesma lógica de grupo, rank e tier do 0005. Substitui ranking_standing e ranking_score.

drop function if exists ranking_score(uuid, text, boolean);
drop function if exists ranking_standing(uuid, text, boolean);

create function ranking_standing(p_session uuid, p_scope text, p_best boolean default false)
returns table (
  metric text, label text, value numeric, rank int, players int,
  percentile numeric, top_pct numeric, tier text, provisional boolean,
  others_values numeric[], others_names text[], others_me boolean[]
)
language sql stable security definer set search_path = public as $$
  with me as (select * from ranking_sessions where id = p_session),
  grp as (
    select s.*, case when pl.is_public then pl.character_name end as pn
    from ranking_sessions s join ranking_players pl on pl.id = s.player_id, me
    where s.status <> 'rejected' and s.vocation = me.vocation
      and (p_scope = 'vocation' or s.hunt = me.hunt)
      and (p_scope <> 'hunt_level' or floor(s.level / 250) = floor(me.level / 250))
  ),
  entries as (
    select id as sid, player_id, pn, 'aa'::text as metric, ''::text as label, aa_per_hour as v from grp where aa_pct >= 10
    union all select id, player_id, pn, 'cast', '', spell_rune_per_hour from grp
    union all select id, player_id, pn, 'carpet', '', gravsan_used::numeric / gravsan_den
      from grp where vocation = 'paladin' and gravsan_den > 0
    union all select g.id, g.player_id, g.pn, 'hits', c.kind || '|' || c.label, c.hits_adj
      from grp g join ranking_session_components c on c.session_id = g.id where c.turns >= 10
  ),
  mine as (select metric, label, v from entries where sid = p_session),
  comp as (
    select m.metric, m.label, e.player_id, e.pn, e.v from mine m join entries e using (metric, label)
      where not p_best and e.sid <> p_session
    union all
    select m.metric, m.label, e.player_id, max(e.pn), max(e.v) from mine m join entries e using (metric, label)
      where p_best and e.player_id <> (select player_id from me)
      group by m.metric, m.label, e.player_id
    union all
    select m.metric, m.label, e.player_id, max(e.pn), max(e.v) from mine m join entries e using (metric, label)
      where p_best and e.player_id = (select player_id from me) and e.sid <> p_session
      group by m.metric, m.label, e.player_id, m.v having max(e.v) > m.v
  ),
  agg as (
    select m.metric, m.label, m.v as value,
      count(c.v) as others,
      count(*) filter (where c.v > m.v) as above,
      count(*) filter (where c.v = m.v) as ties,
      count(*) filter (where c.v < m.v) as below,
      array_agg(c.v order by c.v desc, c.player_id) filter (where c.v is not null) as others_values,
      array_agg(c.pn order by c.v desc, c.player_id) filter (where c.v is not null) as others_names,
      array_agg(c.player_id = (select player_id from me) order by c.v desc, c.player_id) filter (where c.v is not null) as others_me,
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
    players < 30,
    others_values, others_names, others_me
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
