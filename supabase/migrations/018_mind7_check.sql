-- Check Mind7: linha do tempo de vínculos de emprego do candidato.
--
-- O resultado fica no próprio candidato (como os checks de processos e
-- auxílios), em JSON, com a data da última consulta.
alter table public.candidates
  add column if not exists mind7_check_result jsonb,
  add column if not exists mind7_check_at timestamptz;

comment on column public.candidates.mind7_check_result is
  'Vínculos de emprego lidos da consulta Big Data do Mind7 (Mind7CheckResult).';
comment on column public.candidates.mind7_check_at is
  'Quando a consulta do Mind7 foi feita pela última vez.';
