-- Leitura do sino é POR PESSOA.
--
-- Antes a coluna notificacoes.lida_em marcava o aviso como lido para todo
-- mundo: quem abrisse primeiro escondia o aviso dos outros. Aqui cada leitura
-- é uma linha por usuário, e a lista de cada um esconde só o que ele já viu.
create table if not exists public.notificacao_leituras (
  notificacao_id uuid not null references public.notificacoes(id) on delete cascade,
  user_id uuid not null,
  user_email text,
  lida_em timestamptz not null default now(),
  primary key (notificacao_id, user_id)
);

create index if not exists notificacao_leituras_user_idx
  on public.notificacao_leituras (user_id);

alter table public.notificacao_leituras enable row level security;

comment on table public.notificacao_leituras is
  'Quem já leu cada aviso do sino; sem linha aqui, o aviso ainda aparece para a pessoa.';
