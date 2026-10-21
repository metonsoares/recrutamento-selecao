-- Devolve a etapa das 17 candidaturas que a análise de IA moveu sem autorização.
--
-- O QUE ACONTECEU
-- Em 20/10/2026, ao rodar "Analisar pendentes", a análise gravou
-- `status = 'analise_ia_concluida'` INCONDICIONALMENTE nas 17 candidaturas que
-- ela processou. Duas eram de pessoas já CONTRATADAS, que voltaram para a fila
-- de candidatos. Nenhum outro dado foi perdido: contrato, arquivos de
-- funcionário, férias, respostas e documentos continuam intactos — só o rótulo
-- da etapa mudou.
--
-- A CAUSA JÁ ESTÁ FECHADA no código (commit desta mesma rodada): a análise só
-- move a etapa quando o candidato ainda não passou por decisão humana; a
-- sugestão dela continua em `ai_status_suggestion`, sem mover ninguém.
--
-- COMO A ETAPA ANTERIOR FOI RECONSTRUÍDA
-- As 17 tinham `final_score` nulo (foi esse o critério que as selecionou), o
-- que prova que NENHUMA análise havia concluído para elas antes — logo nenhuma
-- estava em 'analise_ia_concluida'. O fluxo que define a etapa é determinístico:
--   /api/public/curriculo      → 'novo'
--   /api/public/culture-test   → 'teste_cultural_preenchido'
-- Então: com contrato assinado → 'contratado'; com teste cultural respondido →
-- 'teste_cultural_preenchido'; sem teste → 'novo'. Nenhuma das 17 tem convite
-- ou entrevista registrada, então não havia etapa de entrevista a restaurar.
--
-- ROLLBACK: `update public.applications set status = 'analise_ia_concluida'
-- where id in (<os mesmos ids abaixo>);`

update public.applications set status = 'contratado', updated_at = now()
where id in (
  '810a6751-63db-4dce-b770-1a81dc3b3158',  -- Bernardo Castro Cavadas (contrato + 17 arquivos)
  '16222cb0-7be8-4d0f-8104-626ac0d99557'   -- Gustavo Martins da Silva (contrato + 30 arquivos + 2 férias)
);

update public.applications set status = 'teste_cultural_preenchido', updated_at = now()
where id in (
  '7fcea29d-686f-4e04-8e42-ed0fd038364b',  -- Alessandra Oliveira Lima
  '96ef0d5b-145c-4d6b-b2d4-4ced186c3d19',  -- Amanda Cristina Marques dos Santos
  'f6f43a55-d1c0-4683-b06b-8a573390281c',  -- Ana Lara Ribeiro Rosa
  'a6218c05-6918-49b4-b638-6aa558346b97',  -- André Luiz Arleo de Faria
  '6f0f6032-8a43-4c3b-8f00-e716798c0bce',  -- Claudia Oliveira de Oliveira
  'cc7182e9-7cdf-4f86-89df-bff8fc811dcf',  -- Fabio Luís da Costa
  '97c93ec4-f34c-4a69-8f4c-936ad04a18ed',  -- Jiullian Clara Mattos dos Santos
  '78bccbe4-f232-40b7-9f75-fed2670967b4',  -- Luana da Cunha Monteiro Ramos
  '6b9e1c99-e808-4864-83aa-30ee2f69d9e0',  -- Maria de Nazaré da Silva Fagundes
  '4e51cc54-73c0-4a95-af09-95d57b3bf431',  -- Raiane Regina da Silva
  '16e18f86-44e6-493d-b2ed-41c1a64e15ca',  -- Rodrigo Silva Souza
  'eec0fb98-2891-4c12-95c4-294c4434e223'   -- Sara da Silva
);

update public.applications set status = 'novo', updated_at = now()
where id in (
  'f42015c6-6ba9-4b2b-ac20-15104cacdc87',  -- Reginaldo Nogueira Gomes (sem teste cultural)
  '7cd382af-db3f-4fb3-a9d3-50ec425a3748',  -- Renata Camara Rispoli (sem teste cultural)
  'f47edf7e-0aab-4496-b466-f274c38de222'   -- Thamires Santos (sem teste cultural)
);
