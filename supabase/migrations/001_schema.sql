-- ============================================================
-- Sistema de Recrutamento e Seleção — Brownie do Ton
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE jobs (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title        text NOT NULL,
  description  text,
  unit         text,
  salary_range text,
  benefits     text,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE candidates (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name             text NOT NULL,
  phone                 text,
  phone_normalized      text,
  email                 text,
  email_normalized      text,
  city                  text,
  neighborhood          text,
  source                text,
  lgpd_accepted         boolean NOT NULL DEFAULT false,
  lgpd_accepted_at      timestamptz,
  latest_application_id uuid,
  possible_duplicate    boolean NOT NULL DEFAULT false,
  deleted_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE applications (
  id                               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id                     uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id                           uuid REFERENCES jobs(id) ON DELETE SET NULL,
  status                           text NOT NULL DEFAULT 'novo',
  source                           text,
  is_latest                        boolean NOT NULL DEFAULT true,
  experience_form_token            text,
  experience_form_token_expires_at timestamptz,
  culture_test_token               text,
  culture_test_token_expires_at    timestamptz,
  culture_score                    numeric,
  experience_score                 numeric,
  availability_score               numeric,
  final_score                      numeric,
  ai_summary                       text,
  ai_strengths                     text[] NOT NULL DEFAULT '{}',
  ai_risks                         text[] NOT NULL DEFAULT '{}',
  ai_recommendation                text,
  ai_status_suggestion             text,
  ai_raw_response                  jsonb,
  created_at                       timestamptz NOT NULL DEFAULT now(),
  updated_at                       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE candidates ADD CONSTRAINT fk_latest_application
  FOREIGN KEY (latest_application_id) REFERENCES applications(id) ON DELETE SET NULL;

CREATE TABLE form_questions (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  form_type     text NOT NULL DEFAULT 'experience',
  question_text text NOT NULL,
  description   text,
  field_type    text NOT NULL DEFAULT 'short_text',
  options       text[] NOT NULL DEFAULT '{}',
  category      text,
  weight        numeric NOT NULL DEFAULT 1,
  is_required   boolean NOT NULL DEFAULT true,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE form_answers (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  question_id    uuid NOT NULL REFERENCES form_questions(id) ON DELETE CASCADE,
  answer_text    text,
  answer_json    jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE culture_questions (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_text text NOT NULL,
  options       text[] NOT NULL DEFAULT '{}',
  ideal_answer  text,
  scores        jsonb NOT NULL DEFAULT '{}',
  culture_value text,
  weight        numeric NOT NULL DEFAULT 1,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE culture_answers (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id  uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  question_id     uuid NOT NULL REFERENCES culture_questions(id) ON DELETE CASCADE,
  selected_option text,
  score           numeric,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_notes (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id   uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  application_id uuid REFERENCES applications(id) ON DELETE SET NULL,
  admin_user_id  uuid,
  note           text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ai_settings (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_culture         text,
  mission                 text,
  vision                  text,
  values                  text[] NOT NULL DEFAULT '{}',
  ideal_candidate_profile text,
  desired_behaviors       text[] NOT NULL DEFAULT '{}',
  alert_behaviors         text[] NOT NULL DEFAULT '{}',
  whatsapp_agent_prompt   text,
  analysis_prompt         text,
  culture_weight          numeric NOT NULL DEFAULT 0.5,
  experience_weight       numeric NOT NULL DEFAULT 0.35,
  availability_weight     numeric NOT NULL DEFAULT 0.15,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE whatsapp_settings (
  id                         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  instance_name              text,
  instance_id                text,
  instance_token_encrypted   text,
  client_token_encrypted     text,
  whatsapp_number            text,
  attendant_name             text,
  api_base_url               text,
  webhook_received_url       text,
  webhook_message_status_url text,
  webhook_disconnected_url   text,
  environment                text,
  is_active                  boolean NOT NULL DEFAULT false,
  last_connection_at         timestamptz,
  last_test_sent_at          timestamptz,
  last_message_received_at   timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE whatsapp_conversations (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id uuid REFERENCES candidates(id) ON DELETE SET NULL,
  phone        text NOT NULL,
  status       text NOT NULL DEFAULT 'active',
  current_step text NOT NULL DEFAULT 'inicio',
  raw_context  jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE whatsapp_messages (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id uuid NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  candidate_id    uuid REFERENCES candidates(id) ON DELETE SET NULL,
  direction       text NOT NULL,
  message_text    text,
  raw_payload     jsonb,
  zapi_message_id text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE whatsapp_logs (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  direction        text,
  action           text,
  phone            text,
  message          text,
  status           text,
  request_payload  jsonb,
  response_payload jsonb,
  error_message    text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_candidates_phone     ON candidates(phone_normalized);
CREATE INDEX idx_candidates_email     ON candidates(email_normalized);
CREATE INDEX idx_candidates_deleted   ON candidates(deleted_at);
CREATE INDEX idx_applications_cand    ON applications(candidate_id);
CREATE INDEX idx_applications_latest  ON applications(is_latest);
CREATE INDEX idx_applications_status  ON applications(status);
CREATE INDEX idx_applications_exp_tok ON applications(experience_form_token);
CREATE INDEX idx_applications_cul_tok ON applications(culture_test_token);
CREATE INDEX idx_form_answers_app     ON form_answers(application_id);
CREATE INDEX idx_culture_answers_app  ON culture_answers(application_id);
CREATE INDEX idx_wapp_conv_phone      ON whatsapp_conversations(phone);
CREATE INDEX idx_wapp_msg_conv        ON whatsapp_messages(conversation_id);

ALTER TABLE jobs                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates             ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications           ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_questions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_answers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE culture_questions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE culture_answers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_notes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_settings            ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_logs          ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all" ON jobs                   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_all" ON candidates             FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_all" ON applications           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_all" ON form_questions         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_all" ON form_answers           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_all" ON culture_questions      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_all" ON culture_answers        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_all" ON admin_notes            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_all" ON ai_settings            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_all" ON whatsapp_settings      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_all" ON whatsapp_conversations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_all" ON whatsapp_messages      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_all" ON whatsapp_logs          FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "service_all" ON candidates             FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON applications           FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON form_answers           FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON culture_answers        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON whatsapp_conversations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON whatsapp_messages      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON whatsapp_logs          FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON whatsapp_settings      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON ai_settings            FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON form_questions         FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON culture_questions      FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "public_read_form_questions"    ON form_questions    FOR SELECT TO anon USING (is_active = true);
CREATE POLICY "public_read_culture_questions" ON culture_questions FOR SELECT TO anon USING (is_active = true);

INSERT INTO ai_settings (company_culture, mission, vision, ideal_candidate_profile, whatsapp_agent_prompt, analysis_prompt, culture_weight, experience_weight, availability_weight)
VALUES ('Somos apaixonados por brownie artesanal e por criar experiencias incriveis.', 'Criar momentos felizes atraves de brownies artesanais feitos com amor.', 'Ser referencia em confeitaria artesanal no Brasil.', 'Pessoa proativa, apaixonada por gastronomia, com bom relacionamento interpessoal.', 'Voce e um assistente de recrutamento da Brownie do Ton. Seja simpatico e profissional.', 'Analise o candidato com base nas respostas do formulario e teste cultural.', 0.5, 0.35, 0.15);

INSERT INTO whatsapp_settings (is_active) VALUES (false);
