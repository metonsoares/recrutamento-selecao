-- ============================================================
-- Correções de segurança — 2026-05-03
-- C1: Restringir acesso admin por email (não por role genérico)
-- C2+A5: Remover políticas INSERT anon (app usa service role)
-- ============================================================

-- ============================================================
-- C1: Reescrever políticas admin para validar por email
-- Substitui USING (auth.role() = 'authenticated') que permitia
-- que qualquer conta Supabase acessasse todos os dados.
-- ============================================================

DROP POLICY IF EXISTS "admin_all_surveys"     ON surveys;
DROP POLICY IF EXISTS "admin_all_sections"    ON survey_sections;
DROP POLICY IF EXISTS "admin_all_questions"   ON questions;
DROP POLICY IF EXISTS "admin_all_options"     ON question_options;
DROP POLICY IF EXISTS "admin_all_respondents" ON respondents;
DROP POLICY IF EXISTS "admin_all_responses"   ON responses;
DROP POLICY IF EXISTS "admin_all_answers"     ON answers;

CREATE POLICY "admin_all_surveys"
  ON surveys FOR ALL
  USING     (auth.jwt() ->> 'email' = 'admin@browniedoton.com.br')
  WITH CHECK(auth.jwt() ->> 'email' = 'admin@browniedoton.com.br');

CREATE POLICY "admin_all_sections"
  ON survey_sections FOR ALL
  USING     (auth.jwt() ->> 'email' = 'admin@browniedoton.com.br')
  WITH CHECK(auth.jwt() ->> 'email' = 'admin@browniedoton.com.br');

CREATE POLICY "admin_all_questions"
  ON questions FOR ALL
  USING     (auth.jwt() ->> 'email' = 'admin@browniedoton.com.br')
  WITH CHECK(auth.jwt() ->> 'email' = 'admin@browniedoton.com.br');

CREATE POLICY "admin_all_options"
  ON question_options FOR ALL
  USING     (auth.jwt() ->> 'email' = 'admin@browniedoton.com.br')
  WITH CHECK(auth.jwt() ->> 'email' = 'admin@browniedoton.com.br');

CREATE POLICY "admin_all_respondents"
  ON respondents FOR ALL
  USING     (auth.jwt() ->> 'email' = 'admin@browniedoton.com.br')
  WITH CHECK(auth.jwt() ->> 'email' = 'admin@browniedoton.com.br');

CREATE POLICY "admin_all_responses"
  ON responses FOR ALL
  USING     (auth.jwt() ->> 'email' = 'admin@browniedoton.com.br')
  WITH CHECK(auth.jwt() ->> 'email' = 'admin@browniedoton.com.br');

CREATE POLICY "admin_all_answers"
  ON answers FOR ALL
  USING     (auth.jwt() ->> 'email' = 'admin@browniedoton.com.br')
  WITH CHECK(auth.jwt() ->> 'email' = 'admin@browniedoton.com.br');

-- ============================================================
-- C2 + A5: Remover políticas INSERT anon
-- O app usa service role para todas as inserções de dados de
-- resposta. As políticas anon criavam superfície de ataque:
-- - INSERT responses: permitia bloquear respondente alheio
-- - INSERT answers: permitia inserir respostas em response alheia
-- ============================================================

DROP POLICY IF EXISTS "public_insert_respondents" ON respondents;
DROP POLICY IF EXISTS "public_insert_responses"   ON responses;
DROP POLICY IF EXISTS "public_insert_answers"     ON answers;
