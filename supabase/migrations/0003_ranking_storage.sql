-- Bucket privado do log cru. Só existe no Supabase (schema storage); rodar no SQL Editor do projeto.
-- Anônimo só pode INSERIR (sem ler, sobrescrever ou apagar). Leitura só pelo service role,
-- para reprocessar o topo. Limite de 8 MB por arquivo; o cliente envia o log comprimido (.gz).
-- Risco aceito no beta (sem senha, só links para pessoas de confiança): qualquer um com o link pode enviar;
-- arquivos órfãos podem ser apagados pelo painel.

insert into storage.buckets (id, name, public, file_size_limit)
values ('ranking-raw-logs', 'ranking-raw-logs', false, 8388608)
on conflict (id) do nothing;

create policy "ranking raw logs: anon insert only"
on storage.objects for insert to anon
with check (bucket_id = 'ranking-raw-logs');
