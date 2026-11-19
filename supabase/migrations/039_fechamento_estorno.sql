-- Estorno no retrato da folha aprovada.
--
-- "Estornos" nasce como mais um lançamento mensal (folha_ciclos.tipo =
-- 'estornos', vários itens por pessoa, cada um com descrição e valor), igual a
-- Adiantamento salarial. Como o fechamento guarda um RETRATO de cada
-- lançamento, a folha aprovada precisa da coluna — senão o mês aprovado
-- mostraria menos do que a tela em que foi aprovado.
--
-- Default 0 e aditiva de propósito: mês já fechado não muda.
alter table public.fechamento_itens
  add column if not exists estorno numeric(12,2) not null default 0;

comment on column public.fechamento_itens.estorno is
  'Soma dos estornos aprovados do mês para esta pessoa (lançamento tipo "estornos").';
