-- ============================================================
-- Seed: Pesquisa Interna – Diagnóstico de Cultura e Perfil
-- Brownie do Ton – 05/2026
-- ============================================================
-- NOTA: As perguntas abaixo foram criadas com base nas 11 seções
-- definidas no escopo do projeto. Revise e ajuste conforme o
-- documento original antes de publicar em produção.
-- ============================================================

DO $$
DECLARE
  v_survey_id UUID;

  -- Seções
  s1 UUID; s2 UUID; s3 UUID; s4 UUID; s5 UUID; s6 UUID;
  s7 UUID; s8 UUID; s9 UUID; s10 UUID; s11 UUID;

  -- Perguntas
  q UUID;

BEGIN

-- ============================================================
-- PESQUISA
-- ============================================================
INSERT INTO surveys (title, description, status)
VALUES (
  'Pesquisa Interna – Diagnóstico de Cultura e Perfil – Brownie do Ton – 05/2026',
  'Esta pesquisa é confidencial e tem como objetivo entender melhor nosso time, nosso ambiente e como podemos evoluir como empresa.

As respostas serão identificadas para permitir uma análise mais precisa pela administração, mas serão tratadas com responsabilidade e utilizadas apenas para fins internos de gestão, desenvolvimento e melhoria da empresa.

Não existem respostas certas ou erradas. Responda com sinceridade.',
  'active'
)
RETURNING id INTO v_survey_id;

-- ============================================================
-- SEÇÕES
-- ============================================================
INSERT INTO survey_sections (id, survey_id, title, display_order)
VALUES (gen_random_uuid(), v_survey_id, 'Perfil', 1) RETURNING id INTO s1;

INSERT INTO survey_sections (id, survey_id, title, display_order)
VALUES (gen_random_uuid(), v_survey_id, 'Condição Atual de Vida', 2) RETURNING id INTO s2;

INSERT INTO survey_sections (id, survey_id, title, display_order)
VALUES (gen_random_uuid(), v_survey_id, 'Aspiração e Vida', 3) RETURNING id INTO s3;

INSERT INTO survey_sections (id, survey_id, title, display_order)
VALUES (gen_random_uuid(), v_survey_id, 'Relação com Dinheiro e Trabalho', 4) RETURNING id INTO s4;

INSERT INTO survey_sections (id, survey_id, title, display_order)
VALUES (gen_random_uuid(), v_survey_id, 'Visão sobre Trabalho', 5) RETURNING id INTO s5;

INSERT INTO survey_sections (id, survey_id, title, display_order)
VALUES (gen_random_uuid(), v_survey_id, 'Futuro e Crescimento', 6) RETURNING id INTO s6;

INSERT INTO survey_sections (id, survey_id, title, display_order)
VALUES (gen_random_uuid(), v_survey_id, 'Percepção sobre a Empresa', 7) RETURNING id INTO s7;

INSERT INTO survey_sections (id, survey_id, title, display_order)
VALUES (gen_random_uuid(), v_survey_id, 'Expectativa com a Empresa', 8) RETURNING id INTO s8;

INSERT INTO survey_sections (id, survey_id, title, display_order)
VALUES (gen_random_uuid(), v_survey_id, 'Liderança e Operação', 9) RETURNING id INTO s9;

INSERT INTO survey_sections (id, survey_id, title, display_order)
VALUES (gen_random_uuid(), v_survey_id, 'Clareza de Função', 10) RETURNING id INTO s10;

INSERT INTO survey_sections (id, survey_id, title, display_order)
VALUES (gen_random_uuid(), v_survey_id, 'Cultura', 11) RETURNING id INTO s11;

-- ============================================================
-- SEÇÃO 1 — PERFIL
-- ============================================================

-- 1.1 Idade
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s1, 'Qual é a sua idade?', 'number', TRUE, 1)
RETURNING id INTO q;
-- sem opções (tipo number)

-- 1.2 Escolaridade
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s1, 'Qual é o seu nível de escolaridade?', 'single_choice', TRUE, 2)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, 'Ensino Fundamental Incompleto', 1),
  (q, 'Ensino Fundamental Completo', 2),
  (q, 'Ensino Médio Incompleto', 3),
  (q, 'Ensino Médio Completo', 4),
  (q, 'Ensino Superior Incompleto', 5),
  (q, 'Ensino Superior Completo', 6),
  (q, 'Pós-graduação', 7);

-- 1.3 Tempo na empresa
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s1, 'Há quanto tempo você trabalha no Brownie do Ton?', 'single_choice', TRUE, 3)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, 'Menos de 3 meses', 1),
  (q, 'De 3 a 6 meses', 2),
  (q, 'De 6 meses a 1 ano', 3),
  (q, 'De 1 a 2 anos', 4),
  (q, 'Mais de 2 anos', 5);

-- 1.4 Outra renda
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s1, 'Você tem outro emprego ou fonte de renda além deste?', 'single_choice', TRUE, 4)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, 'Não', 1),
  (q, 'Sim, trabalho formal', 2),
  (q, 'Sim, trabalho informal ou freela', 3),
  (q, 'Sim, negócio próprio', 4);

-- ============================================================
-- SEÇÃO 2 — CONDIÇÃO ATUAL DE VIDA
-- ============================================================

-- 2.1 Situação financeira
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s2, 'Como você avalia sua situação financeira pessoal hoje?', 'scale', TRUE, 1)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, '1 – Muito difícil', 1),
  (q, '2', 2),
  (q, '3 – Regular', 3),
  (q, '4', 4),
  (q, '5 – Muito confortável', 5);

-- 2.2 Dependentes
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s2, 'Você tem dependentes financeiros (filhos, cônjuge, pais)?', 'single_choice', TRUE, 2)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, 'Não tenho dependentes', 1),
  (q, 'Sim, 1 dependente', 2),
  (q, 'Sim, 2 a 3 dependentes', 3),
  (q, 'Sim, mais de 3 dependentes', 4);

-- 2.3 Moradia
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s2, 'Como é sua situação de moradia atual?', 'single_choice', TRUE, 3)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, 'Imóvel próprio quitado', 1),
  (q, 'Imóvel próprio financiado', 2),
  (q, 'Aluguel', 3),
  (q, 'Morando com familiares', 4),
  (q, 'Outros', 5);

-- 2.4 Equilíbrio vida-trabalho
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s2, 'Como você avalia seu equilíbrio entre trabalho e vida pessoal?', 'scale', TRUE, 4)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, '1 – Muito desequilibrado', 1),
  (q, '2', 2),
  (q, '3 – Regular', 3),
  (q, '4', 4),
  (q, '5 – Muito equilibrado', 5);

-- ============================================================
-- SEÇÃO 3 — ASPIRAÇÃO E VIDA
-- ============================================================

-- 3.1 Objetivos de vida (múltipla escolha, máx 3)
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, max_choices, display_order)
VALUES (gen_random_uuid(), v_survey_id, s3, 'Quais são seus principais objetivos nos próximos 2 anos? (escolha até 3)', 'multiple_choice', TRUE, 3, 1)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, 'Comprar ou construir uma casa', 1),
  (q, 'Estudar ou me qualificar profissionalmente', 2),
  (q, 'Conquistar uma promoção ou aumento', 3),
  (q, 'Empreender ou abrir meu próprio negócio', 4),
  (q, 'Viajar', 5),
  (q, 'Estabilizar minha situação financeira', 6),
  (q, 'Cuidar melhor da saúde', 7),
  (q, 'Passar mais tempo com a família', 8),
  (q, 'Outros', 9);

-- 3.2 Sonho profissional
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s3, 'Você tem algum sonho profissional que gostaria de alcançar? Conte um pouco.', 'open_text', FALSE, 2)
RETURNING id INTO q;

-- 3.3 Sucesso
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s3, 'O que é sucesso para você?', 'open_text', FALSE, 3)
RETURNING id INTO q;

-- ============================================================
-- SEÇÃO 4 — RELAÇÃO COM DINHEIRO E TRABALHO
-- ============================================================

-- 4.1 Principal razão para trabalhar
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s4, 'Qual é a principal razão pela qual você trabalha?', 'single_choice', TRUE, 1)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, 'Sustento pessoal e/ou familiar', 1),
  (q, 'Independência financeira', 2),
  (q, 'Realização profissional', 3),
  (q, 'Adquirir experiência', 4),
  (q, 'Por gostar do que faz', 5),
  (q, 'Outros', 6);

-- 4.2 Satisfação com salário
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s4, 'Como você se sente em relação ao seu salário atual?', 'scale', TRUE, 2)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, '1 – Muito insatisfeito', 1),
  (q, '2', 2),
  (q, '3 – Neutro', 3),
  (q, '4', 4),
  (q, '5 – Muito satisfeito', 5);

-- 4.3 Consegue poupar
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s4, 'Você consegue poupar algum dinheiro todo mês?', 'single_choice', TRUE, 3)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, 'Sim, regularmente', 1),
  (q, 'Às vezes', 2),
  (q, 'Raramente', 3),
  (q, 'Não consigo poupar', 4);

-- 4.4 Salário cobre necessidades
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s4, 'O dinheiro que você ganha hoje cobre suas necessidades básicas?', 'single_choice', TRUE, 4)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, 'Sim, sobra dinheiro', 1),
  (q, 'Sim, cobre tudo certinho', 2),
  (q, 'Cobre quase tudo, mas é apertado', 3),
  (q, 'Não cobre minhas necessidades', 4);

-- ============================================================
-- SEÇÃO 5 — VISÃO SOBRE TRABALHO
-- ============================================================

-- 5.1 O mais importante no trabalho (múltipla escolha, máx 3)
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, max_choices, display_order)
VALUES (gen_random_uuid(), v_survey_id, s5, 'O que é mais importante para você em um trabalho? (escolha até 3)', 'multiple_choice', TRUE, 3, 1)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, 'Salário e benefícios', 1),
  (q, 'Estabilidade e segurança', 2),
  (q, 'Reconhecimento e valorização', 3),
  (q, 'Aprendizado e crescimento', 4),
  (q, 'Bom ambiente de trabalho', 5),
  (q, 'Flexibilidade de horário', 6),
  (q, 'Propósito e significado', 7),
  (q, 'Relacionamento com a equipe', 8);

-- 5.2 Como se sente indo trabalhar
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s5, 'Como você se sente indo trabalhar na maioria dos dias?', 'single_choice', TRUE, 2)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, 'Animado e motivado', 1),
  (q, 'Tranquilo e neutro', 2),
  (q, 'Indiferente', 3),
  (q, 'Cansado ou desmotivado', 4),
  (q, 'Ansioso ou estressado', 5);

-- 5.3 Reconhecimento
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s5, 'Você se sente reconhecido pelo trabalho que realiza?', 'scale', TRUE, 3)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, '1 – Não me sinto reconhecido', 1),
  (q, '2', 2),
  (q, '3 – Às vezes', 3),
  (q, '4', 4),
  (q, '5 – Me sinto muito reconhecido', 5);

-- 5.4 Indicaria a empresa
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s5, 'Você indicaria o Brownie do Ton como um bom lugar para trabalhar para um amigo?', 'scale', TRUE, 4)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, '1 – Não indicaria', 1),
  (q, '2', 2),
  (q, '3 – Talvez', 3),
  (q, '4', 4),
  (q, '5 – Indicaria com certeza', 5);

-- ============================================================
-- SEÇÃO 6 — FUTURO E CRESCIMENTO
-- ============================================================

-- 6.1 Se vê na empresa daqui a 2 anos
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s6, 'Você se vê trabalhando no Brownie do Ton daqui a 2 anos?', 'single_choice', TRUE, 1)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, 'Sim, com certeza', 1),
  (q, 'Provavelmente sim', 2),
  (q, 'Talvez', 3),
  (q, 'Provavelmente não', 4),
  (q, 'Não', 5);

-- 6.2 O que precisa para crescer (múltipla escolha, máx 3)
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, max_choices, display_order)
VALUES (gen_random_uuid(), v_survey_id, s6, 'O que você mais precisa para crescer profissionalmente? (escolha até 3)', 'multiple_choice', TRUE, 3, 2)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, 'Treinamentos e cursos', 1),
  (q, 'Mais responsabilidades', 2),
  (q, 'Feedback e orientação da liderança', 3),
  (q, 'Aumento salarial', 4),
  (q, 'Oportunidade de promoção', 5),
  (q, 'Reconhecimento do meu trabalho', 6),
  (q, 'Melhores ferramentas e condições de trabalho', 7);

-- 6.3 Empresa oferece oportunidades
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s6, 'Você sente que a empresa oferece oportunidades reais de crescimento?', 'scale', TRUE, 3)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, '1 – Não oferece', 1),
  (q, '2', 2),
  (q, '3 – Parcialmente', 3),
  (q, '4', 4),
  (q, '5 – Oferece muito', 5);

-- 6.4 O que impede de crescer mais
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s6, 'O que impede você de crescer mais na empresa atualmente?', 'open_text', FALSE, 4)
RETURNING id INTO q;

-- ============================================================
-- SEÇÃO 7 — PERCEPÇÃO SOBRE A EMPRESA
-- ============================================================

-- 7.1 Ambiente de trabalho geral
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s7, 'Como você avalia o ambiente de trabalho no geral?', 'scale', TRUE, 1)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, '1 – Muito ruim', 1),
  (q, '2', 2),
  (q, '3 – Regular', 3),
  (q, '4', 4),
  (q, '5 – Excelente', 5);

-- 7.2 Sentimento de pertencimento
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s7, 'Você se sente parte da equipe e da empresa?', 'scale', TRUE, 2)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, '1 – Não me sinto parte', 1),
  (q, '2', 2),
  (q, '3 – Às vezes', 3),
  (q, '4', 4),
  (q, '5 – Me sinto muito parte', 5);

-- 7.3 Comunicação interna
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s7, 'Como você avalia a comunicação interna da empresa?', 'scale', TRUE, 3)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, '1 – Muito ruim', 1),
  (q, '2', 2),
  (q, '3 – Regular', 3),
  (q, '4', 4),
  (q, '5 – Excelente', 5);

-- 7.4 O que mais gosta
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s7, 'O que você mais gosta de trabalhar no Brownie do Ton?', 'open_text', FALSE, 4)
RETURNING id INTO q;

-- 7.5 O que mudaria
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s7, 'O que você mudaria na empresa se pudesse?', 'open_text', FALSE, 5)
RETURNING id INTO q;

-- ============================================================
-- SEÇÃO 8 — EXPECTATIVA COM A EMPRESA
-- ============================================================

-- 8.1 O que espera nos próximos 12 meses (múltipla escolha, máx 3)
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, max_choices, display_order)
VALUES (gen_random_uuid(), v_survey_id, s8, 'O que você espera da empresa nos próximos 12 meses? (escolha até 3)', 'multiple_choice', TRUE, 3, 1)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, 'Aumento salarial', 1),
  (q, 'Benefícios (vale alimentação, plano de saúde, etc.)', 2),
  (q, 'Mais organização e processos claros', 3),
  (q, 'Reconhecimento pelo desempenho', 4),
  (q, 'Treinamentos e capacitação', 5),
  (q, 'Mais transparência na comunicação', 6),
  (q, 'Melhor ambiente de trabalho', 7),
  (q, 'Oportunidades de crescimento interno', 8);

-- 8.2 Benefício mais importante que não existe ainda
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s8, 'Qual benefício você considera mais importante e que a empresa ainda não oferece?', 'open_text', FALSE, 2)
RETURNING id INTO q;

-- 8.3 Empresa se preocupa com bem-estar
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s8, 'Você sente que a empresa se preocupa com o bem-estar dos funcionários?', 'scale', TRUE, 3)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, '1 – Não se preocupa', 1),
  (q, '2', 2),
  (q, '3 – Parcialmente', 3),
  (q, '4', 4),
  (q, '5 – Se preocupa muito', 5);

-- ============================================================
-- SEÇÃO 9 — LIDERANÇA E OPERAÇÃO
-- ============================================================

-- 9.1 Avaliação da liderança
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s9, 'Como você avalia a liderança da empresa?', 'scale', TRUE, 1)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, '1 – Muito ruim', 1),
  (q, '2', 2),
  (q, '3 – Regular', 3),
  (q, '4', 4),
  (q, '5 – Excelente', 5);

-- 9.2 À vontade para dar sugestões
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s9, 'Você se sente à vontade para dar sugestões ou fazer perguntas para a liderança?', 'scale', TRUE, 2)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, '1 – Não me sinto à vontade', 1),
  (q, '2', 2),
  (q, '3 – Às vezes', 3),
  (q, '4', 4),
  (q, '5 – Me sinto muito à vontade', 5);

-- 9.3 Reação da liderança a erros
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s9, 'Como a liderança reage quando você comete um erro?', 'single_choice', TRUE, 3)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, 'Com compreensão e orientação', 1),
  (q, 'De forma neutra', 2),
  (q, 'Com pressão ou cobranças excessivas', 3),
  (q, 'Com indiferença', 4);

-- 9.4 Liderança reconhece bom trabalho
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s9, 'A liderança reconhece e valoriza o bom trabalho realizado?', 'scale', TRUE, 4)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, '1 – Nunca reconhece', 1),
  (q, '2', 2),
  (q, '3 – Às vezes', 3),
  (q, '4', 4),
  (q, '5 – Sempre reconhece', 5);

-- 9.5 O que precisa melhorar na gestão/operação
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s9, 'Há algo na gestão ou operação da empresa que você acredita que precisa melhorar? O quê?', 'open_text', FALSE, 5)
RETURNING id INTO q;

-- ============================================================
-- SEÇÃO 10 — CLAREZA DE FUNÇÃO
-- ============================================================

-- 10.1 Clareza sobre responsabilidades
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s10, 'Você tem clareza sobre suas responsabilidades e o que é esperado de você no trabalho?', 'scale', TRUE, 1)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, '1 – Nenhuma clareza', 1),
  (q, '2', 2),
  (q, '3 – Clareza parcial', 3),
  (q, '4', 4),
  (q, '5 – Total clareza', 5);

-- 10.2 Treinamento recebido
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s10, 'Você recebeu um treinamento adequado para realizar suas funções?', 'single_choice', TRUE, 2)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, 'Sim, fui bem treinado(a)', 1),
  (q, 'Sim, mas poderia ter sido melhor', 2),
  (q, 'Fui pouco treinado(a)', 3),
  (q, 'Não recebi treinamento', 4);

-- 10.3 Sabe o que precisa para crescer/promoção
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s10, 'Você sabe o que precisa fazer para receber um aumento ou uma promoção?', 'single_choice', TRUE, 3)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, 'Sim, está claro para mim', 1),
  (q, 'Tenho uma ideia, mas não é muito claro', 2),
  (q, 'Não sei', 3);

-- 10.4 O que falta para desempenhar melhor
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s10, 'O que falta para você desempenhar ainda melhor o seu trabalho?', 'open_text', FALSE, 4)
RETURNING id INTO q;

-- ============================================================
-- SEÇÃO 11 — CULTURA
-- ============================================================

-- 11.1 Valores estão claros
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s11, 'Os valores e a missão da empresa estão claros para você?', 'scale', TRUE, 1)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, '1 – Não estão claros', 1),
  (q, '2', 2),
  (q, '3 – Parcialmente', 3),
  (q, '4', 4),
  (q, '5 – Estão muito claros', 5);

-- 11.2 Empresa age conforme os valores
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s11, 'A empresa age de acordo com os valores que prega?', 'scale', TRUE, 2)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, '1 – Não age', 1),
  (q, '2', 2),
  (q, '3 – Às vezes', 3),
  (q, '4', 4),
  (q, '5 – Sempre age', 5);

-- 11.3 Respeito e inclusão na equipe
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s11, 'Você sente que há respeito e inclusão entre todos os membros da equipe?', 'scale', TRUE, 3)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, '1 – Não há respeito', 1),
  (q, '2', 2),
  (q, '3 – Às vezes', 3),
  (q, '4', 4),
  (q, '5 – Há muito respeito', 5);

-- 11.4 Clima entre a equipe
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s11, 'Como você descreveria o clima entre a equipe no dia a dia?', 'single_choice', TRUE, 4)
RETURNING id INTO q;
INSERT INTO question_options (question_id, option_text, display_order) VALUES
  (q, 'Muito positivo e colaborativo', 1),
  (q, 'Positivo na maior parte do tempo', 2),
  (q, 'Neutro e indiferente', 3),
  (q, 'Às vezes tenso ou conflituoso', 4),
  (q, 'Frequentemente difícil', 5);

-- 11.5 Palavra para descrever a cultura
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s11, 'Em uma palavra ou frase curta, como você descreveria a cultura do Brownie do Ton?', 'open_text', FALSE, 5)
RETURNING id INTO q;

-- 11.6 O que tornaria a empresa melhor
INSERT INTO questions (id, survey_id, section_id, question_text, question_type, is_required, display_order)
VALUES (gen_random_uuid(), v_survey_id, s11, 'O que tornaria o Brownie do Ton um lugar ainda melhor para trabalhar?', 'open_text', FALSE, 6)
RETURNING id INTO q;

END $$;
