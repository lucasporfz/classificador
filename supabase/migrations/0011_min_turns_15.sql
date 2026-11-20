-- Mínimo de turnos de combate por sessão: 50 -> 15 (decisão do usuário, 16/Nov/2026).
-- O cliente (js/ranking-ui.js, MIN_TURNS) usa o mesmo valor.
alter table ranking_sessions drop constraint if exists ranking_sessions_total_turns_check;
alter table ranking_sessions add constraint ranking_sessions_total_turns_check check (total_turns >= 15);
