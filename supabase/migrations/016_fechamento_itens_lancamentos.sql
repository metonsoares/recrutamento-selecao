-- O fechamento passa a consolidar TODOS os lançamentos do mês, e o retrato da
-- folha aprovada precisa guardar cada um: sem isto, a folha aprovada mostraria
-- menos do que a tela onde ela foi aprovada.
alter table public.fechamento_itens
  add column if not exists domingos integer not null default 0,
  add column if not exists feriados integer not null default 0,
  add column if not exists avarias numeric(12,2) not null default 0,
  add column if not exists adiantamento numeric(12,2) not null default 0,
  add column if not exists horas_normais numeric(12,2) not null default 0,
  add column if not exists horas_50 numeric(12,2) not null default 0,
  add column if not exists horas_100 numeric(12,2) not null default 0,
  add column if not exists adicional_noturno numeric(12,2) not null default 0,
  add column if not exists gratificacao numeric(12,2) not null default 0,
  add column if not exists confianca_valor numeric(12,2) not null default 0,
  add column if not exists quebra_valor numeric(12,2) not null default 0;
