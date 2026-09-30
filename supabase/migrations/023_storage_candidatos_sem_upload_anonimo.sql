-- 023 — Storage: tira o upload anônimo do bucket candidatos-arquivos
--
-- A policy "Allow anon uploads" deixava QUALQUER pessoa com a chave publicável
-- gravar arquivo no bucket dos candidatos. O envio do currículo não precisa
-- dela: o formulário público manda o arquivo para /api/public/upload-file, que
-- grava no Storage com a service role (não há nenhum upload direto do
-- navegador — conferido em todo o src/).
--
-- A leitura pública ("Allow public reads" + bucket public=true) é tratada
-- depois, junto com a troca dos links por URL assinada, porque hoje há
-- registros antigos que só guardam a URL pública.

drop policy if exists "Allow anon uploads" on storage.objects;
