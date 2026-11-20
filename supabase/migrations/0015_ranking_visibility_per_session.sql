-- Nome público POR SESSÃO (antes era por personagem: enviar uma sessão nova mudava a escolha de todas as antigas).
-- · ranking_sessions ganha is_public e player_name; as sessões já enviadas herdam a escolha atual do personagem (nada vira público sem querer).
-- · ranking_submit_session grava a escolha na sessão; o nome sai do próprio resumo.
-- · ranking_standing mostra o nome pela sessão.
-- · ranking_session_owner_state: diz se a sessão (pelo hash do log) é de quem tem aquela chave e qual é a escolha.
-- · ranking_set_visibility: muda a escolha de uma sessão, só com a chave do dono (segredo do navegador).

alter table ranking_sessions add column if not exists is_public boolean not null default false;
alter table ranking_sessions add column if not exists player_name text;
update ranking_sessions s set is_public = pl.is_public, player_name = case when pl.is_public then coalesce(pl.character_name, nullif(trim(s.summary->>'player'), '')) end
  from ranking_players pl where pl.id = s.player_id;

create or replace function ranking_submit_session(
  p_player_key_hash text, p_character_name text, p_is_public boolean,
  p_log_hash text, p_raw_log_path text, p_summary jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_player uuid; v_session uuid; c jsonb;
begin
  if coalesce((p_summary->>'unresolvedPct')::numeric, 100) > 20 then
    raise exception 'too_many_unclassified_turns';
  end if;
  if (p_summary->>'maxSingleHit')::numeric > 20000 or (p_summary->>'maxTurnDamage')::numeric > 2000000 then
    raise exception 'implausible_damage';
  end if;

  insert into ranking_players (player_key_hash) values (p_player_key_hash)
  on conflict (player_key_hash) do update set player_key_hash = excluded.player_key_hash   -- só para devolver o id
  returning id into v_player;

  insert into ranking_sessions (
    player_id, log_hash, raw_log_path, engine_version, summary_version, vocation, level, session_date,
    hunt, total_turns, unresolved_pct, aa_pct, aa_per_hour, spell_rune_per_hour, max_turn_damage,
    max_single_hit, gravsan_bonus, gravsan_used, gravsan_den, summary, aa_element, is_public, player_name)
  values (
    v_player, p_log_hash, p_raw_log_path, p_summary->>'engineVersion', (p_summary->>'summaryVersion')::int,
    p_summary->>'vocation', (p_summary->>'level')::int, (p_summary->>'date')::date,
    p_summary->>'hunt', (p_summary->>'totalTurns')::int, (p_summary->>'unresolvedPct')::numeric,
    (p_summary#>>'{aa,pct}')::numeric, (p_summary#>>'{aa,perHour}')::numeric,
    (p_summary#>>'{spellRune,perHour}')::numeric, (p_summary->>'maxTurnDamage')::int,
    (p_summary->>'maxSingleHit')::int, (p_summary#>>'{gravSan,bonus}')::numeric,
    (p_summary#>>'{gravSan,used}')::int, (p_summary#>>'{gravSan,den}')::int, p_summary,
    case when p_summary->>'vocation' = 'paladin' then coalesce(p_summary->>'aaElement', 'physical') end,
    coalesce(p_is_public, false), case when p_is_public then nullif(trim(p_summary->>'player'), '') end)
  returning id into v_session;     -- log_hash repetido estoura unique_violation (duplicata)

  for c in select * from jsonb_array_elements(p_summary->'rows') loop
    insert into ranking_session_components (session_id, label, kind, turns, hits_mean, hits_adj, max_turn_dmg)
    values (v_session, c->>'label', c->>'kind', (c->>'turns')::int, (c->>'hitsMean')::numeric,
            (c->>'hitsAdj')::numeric, coalesce((c->>'maxTurnDmg')::int, 0));
  end loop;
  return v_session;
end $$;



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
    select s.*, case when s.is_public then s.player_name end as pn
    from ranking_sessions s join ranking_players pl on pl.id = s.player_id, me
    where s.status <> 'rejected' and s.vocation = me.vocation
      and (p_scope = 'vocation' or s.hunt = me.hunt)
      and (p_scope <> 'hunt_level' or floor(s.level / 250) = floor(me.level / 250))
  ),
  entries as (
    select id as sid, player_id, pn, 'aa'::text as metric, case when vocation = 'paladin' then coalesce(aa_element, 'physical') else '' end as label, aa_per_hour as v from grp where aa_pct >= 10
    union all select id, player_id, pn, 'cast', '', spell_rune_per_hour from grp
    union all select id, player_id, pn, 'carpet', '', gravsan_used::numeric / gravsan_den
      from grp where vocation = 'paladin' and gravsan_den > 0
    union all select g.id, g.player_id, g.pn, 'hits', c.kind || '|' || c.label || case when c.kind = 'arrow' and g.vocation = 'paladin' then '#' || coalesce(g.aa_element, 'physical') else '' end, c.hits_adj
      from grp g join ranking_session_components c on c.session_id = g.id where c.turns >= 10
    union all select id, player_id, pn, 'maxturn', '', max_turn_damage::numeric from grp where p_scope = 'hunt_level'
    union all select id, player_id, pn, 'maxhit', '', max_single_hit::numeric from grp where p_scope = 'hunt_level'
    union all select g.id, g.player_id, g.pn, 'dmg', c.kind || '|' || c.label || case when c.kind = 'arrow' and g.vocation = 'paladin' then '#' || coalesce(g.aa_element, 'physical') else '' end, c.max_turn_dmg::numeric
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


create or replace function ranking_session_owner_state(p_log_hash text, p_player_key_hash text)
returns table (is_public boolean)
language sql stable security definer set search_path = public as $$
  select s.is_public from ranking_sessions s join ranking_players pl on pl.id = s.player_id
  where s.log_hash = p_log_hash and pl.player_key_hash = p_player_key_hash
$$;

create or replace function ranking_set_visibility(p_log_hash text, p_player_key_hash text, p_is_public boolean)
returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update ranking_sessions s set is_public = coalesce(p_is_public, false), player_name = case when p_is_public then nullif(trim(s.summary->>'player'), '') end
  from ranking_players pl where pl.id = s.player_id and pl.player_key_hash = p_player_key_hash and s.log_hash = p_log_hash;
  get diagnostics n = row_count;
  return n > 0;
end $$;

revoke all on function ranking_session_owner_state(text, text), ranking_set_visibility(text, text, boolean) from public;
grant execute on function ranking_session_owner_state(text, text), ranking_set_visibility(text, text, boolean) to anon, authenticated;
