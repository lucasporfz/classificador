-- PATCH para quem já rodou a versão antiga do 0001 (com convite). Remove o convite e recria a função de envio.
-- Rodar UMA vez no SQL Editor. Quem rodou só a versão nova do 0001 NÃO precisa deste arquivo.

drop function if exists ranking_submit_session(text, text, text, boolean, text, text, jsonb);
drop table if exists ranking_invites;

create function ranking_submit_session(
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

  insert into ranking_players (player_key_hash, character_name, is_public)
  values (p_player_key_hash, case when p_is_public then p_character_name end, p_is_public)
  on conflict (player_key_hash) do update
    set is_public = excluded.is_public, character_name = excluded.character_name
  returning id into v_player;

  insert into ranking_sessions (
    player_id, log_hash, raw_log_path, engine_version, summary_version, vocation, level, session_date,
    hunt, total_turns, unresolved_pct, aa_pct, aa_per_hour, spell_rune_per_hour, max_turn_damage,
    max_single_hit, gravsan_bonus, gravsan_used, gravsan_den, summary)
  values (
    v_player, p_log_hash, p_raw_log_path, p_summary->>'engineVersion', (p_summary->>'summaryVersion')::int,
    p_summary->>'vocation', (p_summary->>'level')::int, (p_summary->>'date')::date,
    p_summary->>'hunt', (p_summary->>'totalTurns')::int, (p_summary->>'unresolvedPct')::numeric,
    (p_summary#>>'{aa,pct}')::numeric, (p_summary#>>'{aa,perHour}')::numeric,
    (p_summary#>>'{spellRune,perHour}')::numeric, (p_summary->>'maxTurnDamage')::int,
    (p_summary->>'maxSingleHit')::int, (p_summary#>>'{gravSan,bonus}')::numeric,
    (p_summary#>>'{gravSan,used}')::int, (p_summary#>>'{gravSan,den}')::int, p_summary)
  returning id into v_session;     -- log_hash repetido estoura unique_violation (duplicata)

  for c in select * from jsonb_array_elements(p_summary->'rows') loop
    insert into ranking_session_components (session_id, label, kind, turns, hits_mean, hits_adj, max_turn_dmg)
    values (v_session, c->>'label', c->>'kind', (c->>'turns')::int, (c->>'hitsMean')::numeric,
            (c->>'hitsAdj')::numeric, coalesce((c->>'maxTurnDmg')::int, 0));
  end loop;
  return v_session;
end $$;

revoke all on function ranking_submit_session from public;
grant execute on function ranking_submit_session to anon, authenticated;
