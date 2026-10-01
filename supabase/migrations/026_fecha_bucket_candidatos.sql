-- Fecha o bucket candidatos-arquivos (passo 3 de 3).
--
-- Passos anteriores: a 023 derrubou o upload anônimo e o app passou a servir
-- esses arquivos por URL assinada (listas, impressão e /api/img) — validado em
-- produção antes desta migration.
--
-- NENHUM ARQUIVO É APAGADO aqui: isto muda só quem pode ler. A URL pública
-- guardada nos registros deixa de abrir sozinha; o caminho dentro do bucket
-- continua saindo dela (src/lib/arquivo-url.ts), então nada precisa ser migrado.
--
-- Reversão, se algo quebrar:
--   update storage.buckets set public = true where id = 'candidatos-arquivos';
--   create policy "Allow public reads" on storage.objects for select to anon
--     using (bucket_id = 'candidatos-arquivos');
update storage.buckets set public = false where id = 'candidatos-arquivos';

drop policy if exists "Allow public reads" on storage.objects;
