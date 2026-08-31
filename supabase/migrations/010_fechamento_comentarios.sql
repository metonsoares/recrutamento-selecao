-- Comentário por colaborador no Fechamento de folha. É a única informação da
-- tela que não vem de outro lugar: o resto é consolidação.
create table if not exists public.fechamento_comentarios (
  id           uuid primary key default gen_random_uuid(),
  competencia  date not null,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  comentario   text not null default '',
  autor        text,
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (competencia, candidate_id)
);
create index if not exists idx_fechamento_comentarios_comp
  on public.fechamento_comentarios (competencia);
alter table public.fechamento_comentarios enable row level security;
-- Sem policy: só o service role, atrás do guard da rota.
