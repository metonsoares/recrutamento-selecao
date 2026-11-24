-- Aviso prévio trabalhado.
--
-- Até aqui todo desligamento era IMEDIATO: a ficha virava `desligado` na hora
-- e o cron do Portal (sync-desligados, de hora em hora) inativava o login.
-- Quem pede demissão e cumpre aviso continua trabalhando por 30 dias — e
-- precisa do sistema funcionando nesse período.
--
-- Por isso o aviso NÃO mexe no status: a pessoa segue `contratado`, com as
-- duas datas abaixo preenchidas, e só vira `desligado` quando o prazo passa
-- (cron /api/cron/aviso-previo). É isso que mantém o acesso ativo durante o
-- aviso sem exceção nenhuma no Portal.
alter table public.applications
  add column if not exists aviso_previo_inicio date,
  add column if not exists aviso_previo_ate date;

comment on column public.applications.aviso_previo_inicio is
  'Primeiro dia do aviso prévio trabalhado. Null = desligamento imediato ou sem aviso.';
comment on column public.applications.aviso_previo_ate is
  'Último dia trabalhado do aviso prévio (início + 29 dias = 30 corridos). No dia seguinte o cron move para desligado.';

-- O cron varre por esta coluna todo dia: índice parcial, só nas linhas em aviso.
create index if not exists applications_aviso_previo_ate_idx
  on public.applications (aviso_previo_ate)
  where aviso_previo_ate is not null;
