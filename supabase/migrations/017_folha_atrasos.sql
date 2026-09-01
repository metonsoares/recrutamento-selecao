-- Quinta contagem do lançamento: Horas extras passou a registrar também os
-- ATRASOS do mês. E o retrato da folha aprovada guarda o número.
alter table public.folha_itens
  add column if not exists quantidade5 numeric(12,2) not null default 0;

alter table public.folha_ciclos
  add column if not exists total_qtd5 numeric(12,2) not null default 0;

alter table public.fechamento_itens
  add column if not exists atrasos numeric(12,2) not null default 0;
