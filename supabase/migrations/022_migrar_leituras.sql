-- Preserva quem já tinha lido antes de a leitura virar por pessoa.
--
-- A tabela notificacoes guardava lida_em/lida_por (e-mail). Sem esta cópia,
-- todos os avisos já lidos voltariam a aparecer para todo mundo.
insert into public.notificacao_leituras (notificacao_id, user_id, user_email, lida_em)
select n.id, u.id, n.lida_por, n.lida_em
from public.notificacoes n
join auth.users u on lower(u.email) = lower(n.lida_por)
where n.lida_em is not null
on conflict (notificacao_id, user_id) do nothing;
