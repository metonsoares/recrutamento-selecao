-- Passagens carregadas no cartão do colaborador, vindas do relatório da WE
-- Benefícios. A recarga é sempre feita no mês ANTERIOR ao de uso (a compra de
-- julho é a passagem de agosto), então `competencia` é o mês de USO — o mesmo
-- mês em que os dias trabalhados são apurados.
create table if not exists public.vt_passagens (
  id            uuid primary key default gen_random_uuid(),
  competencia   date not null,
  candidate_id  uuid references public.candidates(id) on delete set null,
  cpf           text not null,
  nome          text,
  empresa_id    uuid,
  empresa_nome  text,
  quantidade    integer not null default 0 check (quantidade >= 0),
  valor         numeric(12,2) not null default 0 check (valor >= 0),
  pedido        text,
  importado_por text,
  importado_em  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create unique index if not exists vt_passagens_competencia_cpf
  on public.vt_passagens (competencia, cpf);
create index if not exists vt_passagens_candidate
  on public.vt_passagens (candidate_id);

alter table public.vt_passagens enable row level security;
-- Sem policy: só o service role, atrás dos guards das rotas.
