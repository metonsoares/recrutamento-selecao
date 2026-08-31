-- Contagens 2 e 3 dos lançamentos: "Domingos e feriados" lança domingos +
-- feriados; "Horas extras" lança adicional noturno 20%, hora 50% e hora 100%.
alter table public.folha_itens
  add column if not exists quantidade2 numeric(12,2) not null default 0 check (quantidade2 >= 0),
  add column if not exists quantidade3 numeric(12,2) not null default 0 check (quantidade3 >= 0);
alter table public.folha_ciclos
  add column if not exists total_qtd2 numeric(12,2) not null default 0,
  add column if not exists total_qtd3 numeric(12,2) not null default 0;

-- Aprovação do Fechamento de folha, com retrato dos totais no momento.
create table if not exists public.fechamento_ciclos (
  id            uuid primary key default gen_random_uuid(),
  competencia   date not null unique,
  colaboradores integer not null default 0,
  total_dias    integer not null default 0,
  total_faltas  integer not null default 0,
  total_gorjeta numeric(12,2) not null default 0,
  total_salario numeric(12,2) not null default 0,
  aprovado_por  text,
  aprovado_em   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
alter table public.fechamento_ciclos enable row level security;
-- Sem policy: só o service role, atrás do guard de Master.
