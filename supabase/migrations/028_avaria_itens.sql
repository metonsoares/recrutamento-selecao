-- Cadastro de itens de avaria (Folha de pagamento → Avarias → Itens).
--
-- A descrição da avaria era texto livre: o mesmo copo saía como "Taça
-- bordeaux", "taca bordeax" e "Taça Bordeaux", cada um com um preço. Esta
-- tabela é a lista de preços; a tela de Avarias passa a sugerir o item e
-- preencher o valor, mas CONTINUA aceitando item fora da lista — avaria nova
-- não pode esperar cadastro.
create table if not exists public.avaria_itens (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  valor numeric(10,2) not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Um item por nome, sem diferenciar maiúscula/acento de digitação.
create unique index if not exists avaria_itens_nome_unico on public.avaria_itens (lower(nome));

alter table public.avaria_itens enable row level security;

comment on table public.avaria_itens is
  'Lista de itens de avaria com valor de reposição; a avaria grava o texto, não o id.';
