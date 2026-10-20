-- Acerta as 3 divergências de nota cultural que a 030 deixou de fora.
--
-- A 030 corrigiu só o que era impossível pela fórmula (nota 0 com 10 respostas).
-- Estas três tinham nota diferente de zero: o valor gravado podia ter sido
-- correto quando foi calculado, antes de alguma pergunta ou pontuação mudar, e
-- uma delas é de pessoa contratada. Por isso ficaram para decisão do dono, que
-- autorizou acertar as três pelo cálculo de hoje (20/10/2026).
--
-- Nenhum `status` é alterado. A nota final usa a mesma calculateFinalScore() de
-- src/lib/helpers.ts com os pesos de ai_settings (0,50 / 0,35 / 0,15).
--
-- ANTES → DEPOIS (medido imediatamente antes de aplicar)
--   3c71c494-335f-4dd3-930e-92a2c37c9c00  Meton Machado Soares (análise concluída)
--     cultura  2 → 84   |  final  1 → 42
--   e17ca30d-49f0-4aed-9f5d-0f36ea4e4601  Eduardo Leite (análise concluída)
--     cultura 25 → 83   |  final 16 → 45
--   b2d2842b-b025-475d-9b25-2d01dd4a4ea7  Daniele Luiza Vargas Dutra (CONTRATADA)
--     cultura 92 → 84   |  final 83 → 79
--
-- ROLLBACK (restaura exatamente o estado anterior):
--   update public.applications set culture_score =  2, final_score =  1
--     where id = '3c71c494-335f-4dd3-930e-92a2c37c9c00';
--   update public.applications set culture_score = 25, final_score = 16
--     where id = 'e17ca30d-49f0-4aed-9f5d-0f36ea4e4601';
--   update public.applications set culture_score = 92, final_score = 83
--     where id = 'b2d2842b-b025-475d-9b25-2d01dd4a4ea7';

with pesos as (
  select coalesce(culture_weight, 0.5)       as cw,
         coalesce(experience_weight, 0.35)   as ew,
         coalesce(availability_weight, 0.15) as aw
  from public.ai_settings
  limit 1
),
calculado as (
  select a.id,
         round(
           sum(ca.score * coalesce(q.weight, 1))
           / nullif(sum(coalesce(q.weight, 1)), 0) * 10
         ) as nota_cultural
  from public.applications a
  join public.culture_answers ca on ca.application_id = a.id
  left join public.culture_questions q on q.id = ca.question_id
  where a.id in (
    '3c71c494-335f-4dd3-930e-92a2c37c9c00',
    'e17ca30d-49f0-4aed-9f5d-0f36ea4e4601',
    'b2d2842b-b025-475d-9b25-2d01dd4a4ea7'
  )
  group by a.id
)
update public.applications a
set culture_score = c.nota_cultural,
    final_score   = round(
                      c.nota_cultural * p.cw
                      + coalesce(a.experience_score, 0) * p.ew
                      + coalesce(a.availability_score, 0) * p.aw
                    ),
    updated_at    = now()
from calculado c, pesos p
where a.id = c.id;
