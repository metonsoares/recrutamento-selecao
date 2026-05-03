-- ============================================================
-- Políticas de Row Level Security (RLS)
-- ============================================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE surveys           ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_sections   ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_options  ENABLE ROW LEVEL SECURITY;
ALTER TABLE respondents       ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers           ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Políticas para usuário público (anon key)
-- ============================================================

-- Público pode ler pesquisas com status 'active'
CREATE POLICY "public_read_active_surveys"
  ON surveys FOR SELECT
  USING (status = 'active');

-- Público pode ler seções de pesquisas ativas
CREATE POLICY "public_read_sections"
  ON survey_sections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM surveys
      WHERE surveys.id = survey_id
        AND surveys.status = 'active'
    )
  );

-- Público pode ler perguntas de pesquisas ativas
CREATE POLICY "public_read_questions"
  ON questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM surveys
      WHERE surveys.id = survey_id
        AND surveys.status = 'active'
    )
  );

-- Público pode ler alternativas de pesquisas ativas
CREATE POLICY "public_read_options"
  ON question_options FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM questions q
      JOIN surveys s ON s.id = q.survey_id
      WHERE q.id = question_id
        AND s.status = 'active'
    )
  );

-- Público pode inserir respondente (se identificar na pesquisa)
CREATE POLICY "public_insert_respondents"
  ON respondents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM surveys
      WHERE surveys.id = survey_id
        AND surveys.status = 'active'
    )
  );

-- Público pode inserir um response (um por respondente)
CREATE POLICY "public_insert_responses"
  ON responses FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM surveys
      WHERE surveys.id = survey_id
        AND surveys.status = 'active'
    )
  );

-- Público pode inserir respostas
CREATE POLICY "public_insert_answers"
  ON answers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM responses r
      JOIN surveys s ON s.id = r.survey_id
      WHERE r.id = response_id
        AND s.status = 'active'
    )
  );

-- ============================================================
-- Políticas para usuário admin autenticado (Supabase Auth)
-- ============================================================

-- Admin pode fazer tudo nas tabelas de conteúdo da pesquisa
CREATE POLICY "admin_all_surveys"
  ON surveys FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "admin_all_sections"
  ON survey_sections FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "admin_all_questions"
  ON questions FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "admin_all_options"
  ON question_options FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Admin pode ler e gerenciar respondentes e respostas
CREATE POLICY "admin_all_respondents"
  ON respondents FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "admin_all_responses"
  ON responses FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "admin_all_answers"
  ON answers FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
