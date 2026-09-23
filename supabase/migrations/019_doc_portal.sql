-- Link externo para o funcionário enviar os documentos pendentes da ficha.
--
-- Um link por colaborador (não um por documento, como doc_requests): a página
-- pública lê a ficha na hora e lista só o que ainda falta, então o mesmo link
-- serve do primeiro ao último documento.
--
-- Sem policies de propósito: a tabela é lida e escrita apenas pelo servidor
-- (service role). O token é o segredo que autoriza o envio.
create table if not exists public.doc_portals (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  token text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_opened_at timestamptz,
  last_upload_at timestamptz,
  revoked_at timestamptz
);

-- Um link ativo por colaborador; revogar libera a criação de outro.
create unique index if not exists doc_portals_candidate_ativo_idx
  on public.doc_portals (candidate_id) where revoked_at is null;

alter table public.doc_portals enable row level security;

comment on table public.doc_portals is
  'Link externo (token) para o colaborador enviar os documentos pendentes da ficha.';
