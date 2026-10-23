-- Anexos nas Observações Internas da ficha do candidato.
--
-- Pedido do dono em 23/10/2026: a observação interna deve aceitar arquivo
-- junto do texto (limite de 5 MB por arquivo, aplicado na API).
--
-- Cada item do array guarda só o que a tela precisa para listar e baixar:
--   { "name": "atestado.pdf", "path": "observacoes/<candidato>/<ts>-<rand>.pdf",
--     "size": 123456, "type": "application/pdf" }
--
-- Guardamos o PATH, nunca uma URL pública: o bucket `admission-docs` é privado
-- e o download sai por URL assinada de curta duração, gerada pela rota
-- /api/admin/candidatos/[id]/notes/anexo, que exige a permissão da matriz.
alter table public.admin_notes
  add column if not exists attachments jsonb not null default '[]'::jsonb;

comment on column public.admin_notes.attachments is
  'Anexos da observação: [{name, path, size, type}]. path = objeto no bucket privado admission-docs.';
