-- Afastamento sem data de retorno.
--
-- O dono informou em 03/11/2026 que um colaborador está afastado "por tempo
-- indeterminado" (contrato suspenso desde 26/09/2026). O registro de ausência
-- só sabia contar DIAS, então um afastamento em aberto não tinha como ser
-- lançado — inventar um número de dias falsearia tanto o Prêmio Caju quanto a
-- regra de perda de férias por mais de 180 dias afastado.
--
-- `em_aberto = true` significa: começou em `absence_date` e ainda não terminou.
-- Nesse caso `days` deixa de valer (fica 0) e a duração é contada da data de
-- início até hoje, onde for preciso.
alter table public.absences
  add column if not exists em_aberto boolean not null default false;

comment on column public.absences.em_aberto is
  'Afastamento sem data de retorno: vale de absence_date até hoje; days é ignorado.';
