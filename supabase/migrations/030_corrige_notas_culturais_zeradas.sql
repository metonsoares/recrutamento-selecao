-- Corrige as notas culturais que foram zeradas por uma corrida de escrita.
--
-- O QUE ACONTECEU
-- A análise de IA lê as respostas no começo e grava as notas no fim. A análise
-- disparada no envio do currículo começava ANTES do teste cultural; quando
-- terminava depois dele, gravava `culture_score = 0` (o valor que tinha lido:
-- nenhuma resposta) por cima da nota que o teste acabara de salvar. Resultado:
-- 40 candidaturas com nota cultural 0 apesar das 10 respostas gravadas, e nota
-- final calculada com esse zero — média 33 onde deveria ser 77.
--
-- A CAUSA JÁ ESTÁ FECHADA no código (commit da mesma rodada): a análise só
-- grava `culture_score` quando leu respostas; sem respostas, não toca a coluna.
-- Esta migration é só o conserto do passado.
--
-- CRITÉRIO (conservador)
-- Só entra quem tem nota gravada 0 E respostas no banco cujo cálculo dá
-- diferente de 0 — ou seja, zero impossível pela fórmula canônica. As 3
-- divergências com nota diferente de zero (92×84, 25×83 e 2×84) NÃO são
-- tocadas: o valor gravado pode ter sido correto quando foi calculado, antes de
-- alguma pergunta ou pontuação mudar, e uma delas é de pessoa contratada.
-- Nenhum `status` é alterado por esta migration.
--
-- FÓRMULA — a mesma de calculateFinalScore() em src/lib/helpers.ts, com os
-- pesos configurados em ai_settings (hoje 0,50 cultura / 0,35 experiência /
-- 0,15 disponibilidade).
--
-- ROLLBACK: não há reversão automática — o valor anterior era 0 em todas as
-- linhas afetadas, então para desfazer basta zerar de novo as mesmas linhas
-- (a listagem de ids sai do próprio `returning` registrado na execução).

with pesos as (
  select coalesce(culture_weight, 0.5)      as cw,
         coalesce(experience_weight, 0.35)  as ew,
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
  where a.culture_score = 0
  group by a.id
  having round(
           sum(ca.score * coalesce(q.weight, 1))
           / nullif(sum(coalesce(q.weight, 1)), 0) * 10
         ) is distinct from 0
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
