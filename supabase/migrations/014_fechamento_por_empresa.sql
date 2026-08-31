-- O fechamento de folha passa a ser aprovado POR EMPRESA dentro do mês: as
-- empresas fecham em ritmos diferentes e a tela de Folhas aprovadas precisa
-- listar só as que já foram aprovadas naquele período.
alter table public.fechamento_ciclos
  add column if not exists empresa_id uuid,
  add column if not exists empresa_nome text;

-- A unicidade sai da competência e passa para (competência, empresa).
alter table public.fechamento_ciclos
  drop constraint if exists fechamento_ciclos_competencia_key;

-- NULLS NOT DISTINCT: quem não tem empresa na ficha cai num único balde por
-- mês, em vez de gerar uma aprovação nova a cada clique.
create unique index if not exists fechamento_ciclos_competencia_empresa_key
  on public.fechamento_ciclos (competencia, empresa_id) nulls not distinct;

-- Quem foi aprovado, e com que números. O fechamento deixa de ser só um total:
-- o Master marca no checkbox quem entra, e a folha aprovada guarda o retrato
-- de cada colaborador naquele instante.
create table if not exists public.fechamento_itens (
  id uuid primary key default gen_random_uuid(),
  ciclo_id uuid not null references public.fechamento_ciclos(id) on delete cascade,
  candidate_id uuid not null,
  nome text not null,
  cargo text,
  vinculo text,
  dias_trabalhados integer not null default 0,
  faltas integer not null default 0,
  vale_transporte boolean,
  mensalidade_sindical boolean,
  gorjeta numeric(12,2) not null default 0,
  cargo_confianca boolean,
  insalubridade_20 boolean,
  quebra_caixa_15 boolean,
  salario text,
  comentario text,
  created_at timestamptz not null default now(),
  unique (ciclo_id, candidate_id)
);

create index if not exists fechamento_itens_ciclo_idx on public.fechamento_itens (ciclo_id);

-- Sem policy: só o service role (as rotas guardadas por requireMaster) escreve
-- e lê. Mesmo padrão das outras tabelas de fechamento.
alter table public.fechamento_itens enable row level security;
