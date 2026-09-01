-- Quarta contagem por lançamento: as Horas extras passaram a lançar também as
-- HORAS NORMAIS do mês, ao lado dos três adicionais.
alter table public.folha_itens
  add column if not exists quantidade4 numeric(12,2) not null default 0;

alter table public.folha_ciclos
  add column if not exists total_qtd4 numeric(12,2) not null default 0;
