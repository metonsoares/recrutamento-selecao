-- Fecha o acesso direto ao banco para contas logadas (fatia 3 de 3).
--
-- O PROBLEMA
-- Quinze tabelas tinham uma policy `FOR ALL TO authenticated USING (true)`.
-- Como o perfil do usuário deste app vem do Portal BDT — de FORA do banco —,
-- `authenticated` significa "qualquer uma das 14 contas", inclusive operador e
-- externo. Na prática, qualquer pessoa logada podia, com a chave anon pelo
-- console do navegador, ler e escrever os 372 candidatos com CPF, as respostas
-- do teste cultural, as conversas de WhatsApp e o prompt da análise de IA —
-- contornando todo guard de API e de tela.
--
-- POR QUE SÓ AGORA
-- Essas policies eram load-bearing: 18 páginas de servidor liam com a chave
-- anon + sessão e 12 telas gravavam direto do navegador. Derrubar antes deixaria
-- o app em branco. As fatias 1 (9230af4, 21ad849) e 2 (37b0396) moveram tudo
-- para o client de serviço e para rotas com permissão. Agora não há mais
-- nenhum leitor nem escritor dependendo delas.
--
-- O QUE FICA
-- As policies do `anon` continuam exatamente como estão, por decisão do dono:
-- os INSERT do formulário público e os SELECT de vaga/pergunta ativa. Com a
-- policy de `authenticated` removida e a RLS ligada, a tabela passa a negar
-- tudo para quem não tem policy — que é o comportamento seguro padrão.
--
-- ROLLBACK (se alguma tela voltar vazia, recria a permissiva daquela tabela):
--   create policy "admin_all_candidates" on public.candidates
--     for all to authenticated using (true) with check (true);
--   grant select, insert, update, delete on public.candidates to authenticated;
-- ...e assim por diante, com o nome original de cada policy listado abaixo.

drop policy if exists "admin_all_notes"           on public.admin_notes;
drop policy if exists "admin_all_ai_settings"     on public.ai_settings;
drop policy if exists "admin_all_applications"    on public.applications;
drop policy if exists "admin_all_candidates"      on public.candidates;
drop policy if exists "admin_all_culture_answers" on public.culture_answers;
drop policy if exists "admin_all_culture_questions" on public.culture_questions;
drop policy if exists "admin_all_files"           on public.files;
drop policy if exists "admin_all_form_answers"    on public.form_answers;
drop policy if exists "admin_all_form_questions"  on public.form_questions;
drop policy if exists "admin_all"                 on public.form_sections;
drop policy if exists "admin_all_jobs"            on public.jobs;
drop policy if exists "admin_all_conversations"   on public.whatsapp_conversations;
drop policy if exists "admin_all_wa_logs"         on public.whatsapp_logs;
drop policy if exists "admin_all_messages"        on public.whatsapp_messages;
drop policy if exists "admin_all_wa_settings"     on public.whatsapp_settings;

-- Defesa em profundidade: sem policy a RLS já nega, mas tirar o grant fecha
-- também o caso de alguém recriar uma policy permissiva sem perceber.
-- `anon` NÃO é tocado: os INSERT do formulário público dependem do grant dele.
revoke select, insert, update, delete on public.admin_notes            from authenticated;
revoke select, insert, update, delete on public.ai_settings            from authenticated;
revoke select, insert, update, delete on public.applications           from authenticated;
revoke select, insert, update, delete on public.candidates             from authenticated;
revoke select, insert, update, delete on public.culture_answers        from authenticated;
revoke select, insert, update, delete on public.culture_questions      from authenticated;
revoke select, insert, update, delete on public.files                  from authenticated;
revoke select, insert, update, delete on public.form_answers           from authenticated;
revoke select, insert, update, delete on public.form_questions         from authenticated;
revoke select, insert, update, delete on public.form_sections          from authenticated;
revoke select, insert, update, delete on public.jobs                   from authenticated;
revoke select, insert, update, delete on public.whatsapp_conversations from authenticated;
revoke select, insert, update, delete on public.whatsapp_logs          from authenticated;
revoke select, insert, update, delete on public.whatsapp_messages      from authenticated;
revoke select, insert, update, delete on public.whatsapp_settings      from authenticated;
