-- Sino de notificações do painel.
--
-- Duas naturezas convivem aqui: o aviso de EVENTO (o colaborador enviou um
-- documento pelo link) nasce no momento em que acontece, e os de PRAZO (férias,
-- documento da empresa, aniversário, contrato de experiência) são calculados a
-- partir dos dados e materializados nesta tabela.
--
-- `chave` única é o que permite recalcular à vontade: o mesmo alerta nunca vira
-- duas linhas, e marcar como lido continua valendo na próxima conferência.
create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  chave text not null unique,
  titulo text not null,
  descricao text,
  url text,
  candidate_id uuid references public.candidates(id) on delete cascade,
  criada_em timestamptz not null default now(),
  lida_em timestamptz,
  lida_por text
);

create index if not exists notificacoes_abertas_idx
  on public.notificacoes (criada_em desc) where lida_em is null;

alter table public.notificacoes enable row level security;

comment on table public.notificacoes is
  'Avisos do sino do painel; chave única garante que recalcular não duplica.';
