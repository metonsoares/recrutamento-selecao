-- ============================================================
-- Pesquisa Interna Brownie do Ton — Schema Principal
-- ============================================================

-- Tabela de pesquisas
CREATE TABLE IF NOT EXISTS surveys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft', 'active', 'closed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seções de cada pesquisa
CREATE TABLE IF NOT EXISTS survey_sections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id     UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  display_order INTEGER NOT NULL,
  UNIQUE (survey_id, display_order)
);

-- Perguntas
CREATE TABLE IF NOT EXISTS questions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id     UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  section_id    UUID NOT NULL REFERENCES survey_sections(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL
                CHECK (question_type IN (
                  'single_choice',
                  'multiple_choice',
                  'scale',
                  'open_text',
                  'number'
                )),
  is_required   BOOLEAN NOT NULL DEFAULT TRUE,
  max_choices   INTEGER,  -- usado em multiple_choice
  display_order INTEGER NOT NULL,
  UNIQUE (section_id, display_order)
);

-- Alternativas de resposta
CREATE TABLE IF NOT EXISTS question_options (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id   UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  option_text   TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  UNIQUE (question_id, display_order)
);

-- Respondentes identificados
CREATE TABLE IF NOT EXISTS respondents (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id  UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cabeçalho de cada envio (um por respondente por pesquisa)
CREATE TABLE IF NOT EXISTS responses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id     UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  respondent_id UUID NOT NULL REFERENCES respondents(id) ON DELETE CASCADE,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (respondent_id) -- um envio por respondente
);

-- Respostas individuais
CREATE TABLE IF NOT EXISTS answers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id   UUID NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  question_id   UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  option_id     UUID REFERENCES question_options(id),
  answer_text   TEXT,
  answer_number NUMERIC,
  -- Cada resposta deve ter ao menos um valor preenchido
  CONSTRAINT answer_has_value CHECK (
    option_id IS NOT NULL OR
    answer_text IS NOT NULL OR
    answer_number IS NOT NULL
  )
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_survey_sections_survey_id ON survey_sections(survey_id);
CREATE INDEX IF NOT EXISTS idx_questions_section_id ON questions(section_id);
CREATE INDEX IF NOT EXISTS idx_questions_survey_id ON questions(survey_id);
CREATE INDEX IF NOT EXISTS idx_question_options_question_id ON question_options(question_id);
CREATE INDEX IF NOT EXISTS idx_respondents_survey_id ON respondents(survey_id);
CREATE INDEX IF NOT EXISTS idx_responses_survey_id ON responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_responses_respondent_id ON responses(respondent_id);
CREATE INDEX IF NOT EXISTS idx_answers_response_id ON answers(response_id);
CREATE INDEX IF NOT EXISTS idx_answers_question_id ON answers(question_id);
