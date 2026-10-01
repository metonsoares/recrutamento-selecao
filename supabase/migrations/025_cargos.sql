-- Cadastro de cargos (Configurações → Empresa → Cadastro de cargos).
--
-- Até aqui o cargo era texto livre na ficha (admission_form.function_title), e
-- o mesmo cargo aparecia escrito de jeitos diferentes ("Auxiliar administrativo"
-- e "Auxiliar Administrativo"). Esta tabela é a lista oficial; a ficha continua
-- gravando o texto, então nada quebra enquanto as telas são ajustadas.
create table if not exists public.cargos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Um cargo por nome, sem diferenciar maiúscula: é o que evita a duplicata de
-- grafia que existe hoje nas fichas.
create unique index if not exists cargos_nome_unico on public.cargos (lower(nome));

alter table public.cargos enable row level security;

comment on table public.cargos is
  'Lista oficial de cargos; a ficha grava o texto do cargo (function_title).';

-- Semeia com os cargos que já existem nas fichas, mantendo a grafia mais usada.
insert into public.cargos (nome)
select nome from (
  select trim(a.admission_form->>'function_title') as nome,
         count(*) as pessoas,
         row_number() over (
           partition by lower(trim(a.admission_form->>'function_title'))
           order by count(*) desc, trim(a.admission_form->>'function_title')
         ) as ordem
  from public.applications a
  where a.is_latest
    and coalesce(trim(a.admission_form->>'function_title'), '') <> ''
  group by 1
) x
where x.ordem = 1
on conflict do nothing;
