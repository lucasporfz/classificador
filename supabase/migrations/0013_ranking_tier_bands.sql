-- Novas faixas de tier (percentis): S = P90–P100 (top 10%), A = P70–P90 (top 30%), B = P30–P70 (top 70%),
-- C = P10–P30 (top 90%), D = P0–P10. Antes: S ≤5, A ≤10, B ≤50, C ≤90 (top %). Mudam só os cortes do tier;
-- rank, percentil, regras de dano e o peso do score (S8 A5 B3 C2 D1) ficam como estavam.
-- Recria ranking_standing/ranking_score (do 0012) e ranking_preview (do 0010) com os cortes novos.

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
    union all select id, player_id, pn, 'maxturn', '', max_turn_damage::numeric from grp where p_scope = 'hunt_level'
    union all select id, player_id, pn, 'maxhit', '', max_single_hit::numeric from grp where p_scope = 'hunt_level'
    union all select g.id, g.player_id, g.pn, 'dmg', c.kind || '|' || c.label, c.max_turn_dmg::numeric
      from grp g join ranking_session_components c on c.session_id = g.id where c.turns >= 10 and p_scope = 'hunt_level'
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
         when (1 - percentile) * 100 <= 10 then 'S' when (1 - percentile) * 100 <= 30 then 'A'
         when (1 - percentile) * 100 <= 70 then 'B' when (1 - percentile) * 100 <= 90 then 'C' else 'D' end,
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
    from ranking_standing(p_session, p_scope, p_best)
    where percentile is not null and metric in ('aa', 'cast', 'carpet', 'hits')
  ) t
$$;

-- As funções são security definer e leem tabelas sem política de leitura; devolvem só números.
revoke all on function ranking_standing, ranking_score from public;
grant execute on function ranking_standing, ranking_score to anon, authenticated;

drop function if exists ranking_preview(jsonb);
drop function if exists ranking_preview(jsonb, text);

create function ranking_preview(p_summary jsonb, p_player_key_hash text default null)
returns table (
  metric text, label text, rank int, players int, entries int, percentile numeric, top_pct numeric,
  tier text, provisional boolean, locked int, group_players int
)
language sql stable security definer set search_path = public as $$
  with me as (select p_summary->>'vocation' as voc, p_summary->>'hunt' as hunt,
    (select id from ranking_players where player_key_hash = p_player_key_hash) as pid),
  grp as (
    select s.* from ranking_sessions s, me
    where s.status <> 'rejected' and s.vocation = me.voc and s.hunt = me.hunt
  ),
  entries as (
    select 'aa'::text as metric, ''::text as label, player_id, aa_per_hour as v from grp where aa_pct >= 10
    union all select 'cast', '', player_id, spell_rune_per_hour from grp
    union all select 'carpet', '', player_id, gravsan_used::numeric / gravsan_den
      from grp where vocation = 'paladin' and gravsan_den > 0
    union all select 'hits', c.kind || '|' || c.label, g.player_id, c.hits_adj
      from grp g join ranking_session_components c on c.session_id = g.id where c.turns >= 10
  ),
  mine as (
    select 'aa'::text as metric, ''::text as label, (p_summary#>>'{aa,perHour}')::numeric as v
      where coalesce((p_summary#>>'{aa,pct}')::numeric, 0) >= 10
    union all select 'cast', '', (p_summary#>>'{spellRune,perHour}')::numeric
    union all select 'carpet', '', (p_summary#>>'{gravSan,used}')::numeric / (p_summary#>>'{gravSan,den}')::numeric
      from me where me.voc = 'paladin' and coalesce((p_summary#>>'{gravSan,den}')::numeric, 0) > 0
    union all select 'hits', (r->>'kind') || '|' || (r->>'label'), (r->>'hitsAdj')::numeric
      from jsonb_array_elements(coalesce(p_summary->'rows', '[]'::jsonb)) r
      where (r->>'turns')::int >= 10
  ),
  agg as (
    select m.metric, m.label,
      count(e.v) as others,
      count(*) filter (where e.v > m.v) as above,
      count(*) filter (where e.v = m.v) as ties,
      count(*) filter (where e.v < m.v) as below,
      count(distinct case when e.player_id is distinct from (select pid from me) then e.player_id end) + 1 as players
    from mine m left join entries e using (metric, label)
    group by m.metric, m.label, m.v
  ),
  scored as (
    select *, (below + 0.5 * ties) / others as pct from agg where others > 0 and players >= 3
  ),
  best as (select * from scored order by pct desc, players desc, metric, label limit 1)
  select b.metric, b.label, (1 + b.above)::int, b.players::int, (b.others + 1)::int, round(b.pct, 4), round((1 - b.pct) * 100, 2),
    case when b.pct is null then null
         when (1 - b.pct) * 100 <= 10 then 'S' when (1 - b.pct) * 100 <= 30 then 'A'
         when (1 - b.pct) * 100 <= 70 then 'B' when (1 - b.pct) * 100 <= 90 then 'C' else 'D' end,
    b.players < 30,
    greatest((select count(*) from mine) - 1, 0)::int,
    ((select count(distinct player_id) from grp where player_id is distinct from (select pid from me)) + 1)::int
  from (select 1) x left join best b on true
$$;

revoke all on function ranking_preview(jsonb, text) from public;
grant execute on function ranking_preview(jsonb, text) to anon, authenticated;
