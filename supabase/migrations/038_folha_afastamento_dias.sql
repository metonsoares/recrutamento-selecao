-- Afastamento separado das faltas na folha.
--
-- Até aqui a coluna "Faltas" do fechamento somava TODA ausência do mês, sem
-- olhar o tipo: uma falta injustificada e um afastamento por doença entravam
-- no mesmo número. São coisas diferentes para quem fecha a folha — uma desconta,
-- a outra é benefício — e o Prêmio Caju já tratava assim (só injustificada).
--
-- Decisão do dono em 03/11/2026: separar. `faltas` passa a contar só as
-- injustificadas e os dias de afastamento ficam nesta coluna.
alter table public.fechamento_itens
  add column if not exists afastamento_dias integer not null default 0;

comment on column public.fechamento_itens.afastamento_dias is
  'Dias de afastamento (acidente/doença/contrato suspenso) dentro da competência. Faltas injustificadas ficam em `faltas`.';
