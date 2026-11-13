-- Reenvio do mesmo log: devolve a sessão já guardada, para o cliente mostrar a posição
-- em vez de só o erro de duplicata. Só confirma o hash que a pessoa já tem em mãos.
create function ranking_session_by_hash(p_log_hash text)
returns uuid
language sql stable security definer set search_path = public as $$
  select id from ranking_sessions where log_hash = p_log_hash and status <> 'rejected'
$$;

revoke all on function ranking_session_by_hash from public;
grant execute on function ranking_session_by_hash to anon, authenticated;
