-- Ranking de jogadores: tabelas, RLS e envio. RASCUNHO, não aplicado a nenhum projeto.
-- Identidade anônima: o cliente gera um segredo local; guardamos só o hash dele. Isso liga
-- as sessões do mesmo jogador ("Best of each player") sem login. owner_id fica vazio para
-- um login com Discord futuro.

create table ranking_players (
  id uuid primary key default gen_random_uuid(),
  player_key_hash text not null unique,          -- sha256 do segredo do cliente
  character_name text,                           -- só preenchido se is_public
  is_public boolean not null default false,      -- opt-in: mostrar o nome do personagem
  owner_id uuid references auth.users(id),       -- reservado (Discord)
  created_at timestamptz not null default now()
);

create table ranking_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references ranking_players(id),
  log_hash text not null unique,                 -- sha256 do par de logs: rejeita duplicata
  raw_log_path text not null,                    -- objeto no Storage (bucket ranking-raw-logs, privado)
  engine_version text not null,
  summary_version int not null,
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  vocation text not null check (vocation in ('knight','paladin','sorcerer','druid','monk')),
  level int not null check (level between 1 and 5000),
  session_date date not null,
  hunt text not null,
  total_turns int not null check (total_turns >= 50),
  unresolved_pct numeric(5,2) not null check (unresolved_pct between 0 and 100),
  aa_pct numeric(6,2) not null default 0,
  aa_per_hour numeric(10,1) not null default 0,
  spell_rune_per_hour numeric(10,1) not null default 0,
  max_turn_damage int not null default 0,
  max_single_hit int not null default 0,
  gravsan_bonus numeric(6,4) not null default 0,
  gravsan_used int not null default 0,
  gravsan_den int not null default 0,
  summary jsonb not null,                        -- resumo completo como enviado
  created_at timestamptz not null default now()
);
create index on ranking_sessions (vocation, hunt, level);
create index on ranking_sessions (player_id);

create table ranking_session_components (
  session_id uuid not null references ranking_sessions(id) on delete cascade,
  label text not null,
  kind text not null,
  turns int not null check (turns >= 0),
  hits_mean numeric(10,3) not null,
  hits_adj numeric(10,3) not null,
  max_turn_dmg int not null default 0,
  primary key (session_id, kind, label)
);

-- RLS: nenhuma política = nenhum acesso direto pela API pública. Escrita só pela função
-- abaixo; leitura só pelas views de agregados (arquivo seguinte).
alter table ranking_players enable row level security;
alter table ranking_sessions enable row level security;
alter table ranking_session_components enable row level security;

-- Envio: valida o mínimo e insere tudo numa transação. p_summary = saída de
-- RankingSessionSummary.buildSessionSummary (js/ranking-session-summary.js).
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

-- Storage (criar no painel ou via CLI): bucket privado "ranking-raw-logs"; upload só por
-- URL assinada emitida no envio; leitura só com service role (reprocessamento do topo).
