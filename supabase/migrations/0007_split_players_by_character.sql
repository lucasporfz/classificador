-- Identidade passa a ser POR PERSONAGEM (segredo do navegador + nome do personagem), não por navegador.
-- Motivo: o ranking compara personagens; sessões de personagens diferentes enviadas do mesmo navegador
-- contavam como um jogador só e o grupo nunca chegava a 3.
-- Este arquivo separa as sessões já enviadas: um jogador por (jogador antigo, personagem do resumo).
-- O hash real não dá para recalcular (depende do segredo local), então as linhas ficam com chave 'legacy:'.
-- Rode UMA vez. Seguro de repetir: sessões já separadas são ignoradas.

insert into ranking_players (player_key_hash)
select distinct 'legacy:' || s.player_id || ':' || lower(s.summary->>'player')
from ranking_sessions s
where s.summary->>'player' is not null
  and not exists (select 1 from ranking_players p where p.id = s.player_id and p.player_key_hash like 'legacy:%')
on conflict do nothing;

update ranking_sessions s set player_id = p.id
from ranking_players p
where s.summary->>'player' is not null
  and p.player_key_hash = 'legacy:' || s.player_id || ':' || lower(s.summary->>'player')
  and not exists (select 1 from ranking_players o where o.id = s.player_id and o.player_key_hash like 'legacy:%');
