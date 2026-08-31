-- Quebra de caixa: a base é fixa (15% do salário) e o que varia é o desconto
-- do mês. Guardar o desconto em coluna própria mantém a conta auditável.
alter table public.folha_itens
  add column if not exists desconto numeric(12,2) not null default 0 check (desconto >= 0);
alter table public.folha_ciclos
  add column if not exists total_desconto numeric(12,2) not null default 0;
