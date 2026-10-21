-- Recalcula a nota final das candidaturas em que ela ficou com cultura = 0.
--
-- O QUE ACONTECEU
-- `/api/public/culture-test` gravava a nota CULTURAL ao receber o teste, mas
-- não refazia a nota FINAL. A nota final continuava sendo a que a análise de IA
-- tinha calculado ANTES do teste existir — portanto com cultura zero. O efeito
-- é o oposto da migration 030: lá a análise atropelava a nota cultural; aqui a
-- nota cultural está certa e a final é que ficou velha.
--
-- Pessoas com cultura 91-97 apareciam no funil com nota final de 14 a 42,
-- entre 23 e 48 pontos abaixo do real. Uma delas já está contratada.
--
-- A CAUSA JÁ ESTÁ FECHADA no código (commit desta mesma rodada): a rota do
-- teste cultural passou a recalcular a nota final junto, com a mesma
-- calculateFinalScore() de src/lib/helpers.ts.
--
-- CRITÉRIO
-- Só entra quem tem nota final EXATAMENTE igual ao que a fórmula daria com
-- cultura zero, e cultura gravada maior que zero — ou seja, a assinatura exata
-- do defeito, sem margem de interpretação. Por decisão do dono (20/10/2026),
-- candidatura com status `reprovado` fica de fora: a decisão humana já foi
-- tomada e não vamos mexer no histórico dela. Nenhum `status` é alterado.
--
-- ROLLBACK: o valor anterior é reproduzível pela própria fórmula, sem precisar
-- de lista de ids —
--   update public.applications a set final_score = round(
--     coalesce(a.experience_score,0) * 0.35 + coalesce(a.availability_score,0) * 0.15)
--   where <mesmo filtro de ids desta migration>;

with pesos as (
  select coalesce(culture_weight, 0.5)       as cw,
         coalesce(experience_weight, 0.35)   as ew,
         coalesce(availability_weight, 0.15) as aw
  from public.ai_settings
  limit 1
),
afetadas as (
  select a.id,
         round(a.culture_score * p.cw
               + coalesce(a.experience_score, 0) * p.ew
               + coalesce(a.availability_score, 0) * p.aw) as nota_correta
  from public.applications a
  join public.candidates c on c.id = a.candidate_id
  cross join pesos p
  where a.is_latest
    and c.deleted_at is null
    and a.status <> 'reprovado'
    and a.culture_score > 0
    -- assinatura do defeito: a final é o que daria SEM a cultura
    and a.final_score = round(coalesce(a.experience_score, 0) * p.ew
                              + coalesce(a.availability_score, 0) * p.aw)
    and a.final_score is distinct from round(a.culture_score * p.cw
                              + coalesce(a.experience_score, 0) * p.ew
                              + coalesce(a.availability_score, 0) * p.aw)
)
update public.applications a
set final_score = f.nota_correta,
    updated_at  = now()
from afetadas f
where a.id = f.id;
