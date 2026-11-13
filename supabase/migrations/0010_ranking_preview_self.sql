-- Prévia: passa a receber a chave do jogador (hash) para NÃO contar você duas vezes. Quem já tem outras sessões
-- na hunt aparecia como "outro jogador" e a prévia dava posição que não batia com o ranking completo.
-- Contagem de jogadores = mesma de ranking_standing: outros jogadores distintos + você. Substitui o 0009.

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
         when (1 - b.pct) * 100 <= 5 then 'S' when (1 - b.pct) * 100 <= 10 then 'A'
         when (1 - b.pct) * 100 <= 50 then 'B' when (1 - b.pct) * 100 <= 90 then 'C' else 'D' end,
    b.players < 30,
    greatest((select count(*) from mine) - 1, 0)::int,
    ((select count(distinct player_id) from grp where player_id is distinct from (select pid from me)) + 1)::int
  from (select 1) x left join best b on true
$$;

revoke all on function ranking_preview(jsonb, text) from public;
grant execute on function ranking_preview(jsonb, text) to anon, authenticated;
