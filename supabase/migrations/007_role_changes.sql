-- Mudanças de função do colaborador. Espelha salary_raises: a ficha guarda a
-- função ATUAL (admission_form.function_title) e esta tabela guarda a linha do
-- tempo, para a troca não apagar o histórico.
create table if not exists public.role_changes (
  id             uuid primary key default gen_random_uuid(),
  candidate_id   uuid not null references public.candidates(id) on delete cascade,
  change_date    date not null,
  previous_title text,
  new_title      text not null,
  comment        text,
  created_by     text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_role_changes_candidate
  on public.role_changes (candidate_id, change_date desc);

alter table public.role_changes enable row level security;
-- Sem policy: só o service role, atrás dos guards das rotas.
