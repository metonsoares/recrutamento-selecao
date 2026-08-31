-- Lançamentos mensais de folha que seguem o mesmo molde: avarias, domingos e
-- feriados, horas extras, gratificação, cargo de confiança, insalubridade e
-- quebra de caixa. Um par de tabelas para os sete, com a coluna `tipo`.
create table if not exists public.folha_ciclos (
  id           uuid primary key default gen_random_uuid(),
  tipo         text not null,
  competencia  date not null,
  total_valor  numeric(12,2) not null default 0,
  total_qtd    numeric(12,2) not null default 0,
  aprovado_por text,
  aprovado_em  timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tipo, competencia)
);

create table if not exists public.folha_itens (
  id           uuid primary key default gen_random_uuid(),
  ciclo_id     uuid not null references public.folha_ciclos(id) on delete cascade,
  candidate_id uuid references public.candidates(id) on delete set null,
  nome         text not null,
  cargo        text,
  empresa_id   uuid,
  empresa_nome text,
  quantidade   numeric(12,2) not null default 0 check (quantidade >= 0),
  valor        numeric(12,2) not null default 0 check (valor >= 0),
  observacao   text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_folha_ciclos_tipo_comp on public.folha_ciclos (tipo, competencia);
create index if not exists idx_folha_itens_ciclo      on public.folha_itens (ciclo_id);
create index if not exists idx_folha_itens_candidate  on public.folha_itens (candidate_id);

alter table public.folha_ciclos enable row level security;
alter table public.folha_itens  enable row level security;
-- Sem policy: só o service role, atrás do guard da rota.
