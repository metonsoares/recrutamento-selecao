-- admission-docs guarda RG, CPF, CNH, contratos assinados e advertências.
-- Estava PÚBLICO: dava para listar e baixar tudo com a chave publishable.
-- Só é seguro fechar depois que o app passou a abrir documento por URL
-- assinada no clique (/api/admin/arquivos/assinar).
update storage.buckets set public = false where id = 'admission-docs';

drop policy if exists "Public read admission docs" on storage.objects;
drop policy if exists "Authenticated users can delete admission docs" on storage.objects;
drop policy if exists "Authenticated users can upload admission docs" on storage.objects;
