-- Reclassifica o nível de risco do check de processos pela REGRA DA CASA.
--
-- Regra definida pelo dono em 21/10/2026, depois de um candidato com 3
-- reclamações trabalhistas aparecer com o selo verde "BAIXO":
--
--   processo criminal    → alto   (vermelho)
--   processo trabalhista → alto   (vermelho)
--   cível e os demais    → médio  (amarelo)
--   nenhum processo      → baixo  (verde)
--
-- Até aqui o nível era decidido pela IA, caso a caso — por isso o mesmo tipo de
-- processo virava "baixo" numa ficha e "médio" em outra. A partir do commit
-- desta rodada o nível é calculado em `src/lib/risco-processos.ts` e sobrescreve
-- o que o modelo devolver; esta migration acerta o que já estava gravado.
--
-- O tipo sai do texto do próprio processo, que a IA já rotula ("— Tipo:
-- TRABALHISTA", "Tipo: Criminal"). Sem conseguir identificar o tipo, cai em
-- médio — "baixo" fica reservado a quem comprovadamente não tem processo.
--
-- ALCANCE: 135 fichas com check feito; 69 mudam de nível (23 que estavam
-- "baixo", 35 "médio" e 11 "não determinado"). Nenhum outro campo é tocado —
-- parecer, processos, URLs e datas ficam como estão.
--
-- ROLLBACK: o valor anterior vinha do julgamento da IA e NÃO é reproduzível por
-- regra, então vai nominal aqui:
--   update public.candidates set background_check_result =
--     jsonb_set(background_check_result, '{nivel_risco}', '"baixo"')
--   where id in ('19e0ce0f-aa0a-45d1-a8fb-d7d86660ed32','1a72f8b4-656c-40c2-a1ca-7c078d88888f',
--     '250aa2d6-c5c0-40e3-9c88-46f5c8dc802c','320761f3-1230-417c-a4db-28cd3dc84c48',
--     '3e124e27-1425-4177-af02-01a513c34158','40bfa9af-f7cc-475e-85b3-cbbcd037629b',
--     '459f23e5-7eb0-4f0c-bbbb-d84ee7c6104a','6c592a21-3262-44f5-ab94-b60554f0b109',
--     '725765ae-76df-451e-b54a-4664f98253f0','7a97a489-b60f-46aa-bd75-0eb9e956adef',
--     '822d939b-9993-48d4-abd1-619f872c4778','8e728f14-417b-45bb-8d65-1b0cd32fa08a',
--     'aab98377-b827-4f3a-8305-7b70ba6ba69a','b57e7df6-1d1d-4590-9c22-00af1271d349',
--     'b672754a-9d77-4e56-8e5e-70b799bc788e','c1ea2787-e879-4a5b-984c-9275950ea6b2',
--     'd3014c5a-dd39-44f4-a365-0f952ca56bd1','db9e00ca-593e-4a24-9e56-356f7e0c6b11',
--     'dc93a4f8-a6ac-44bd-a583-2ffedfbb4d5a','e2bc6b63-8ebd-4371-99b0-e21c1c33d1aa',
--     'ede27d87-2316-4509-aced-6c0673e260f0','f3f54d1f-4103-40bc-aabe-28474d661661',
--     'ffca32a3-d154-48b6-ae18-e518ecba25ca');
--   -- idem com '"medio"' para: '088ad0be-715d-4165-b297-a1a9814554c8','0a444f1d-31b3-47f4-af1b-c75003111f1e',
--   --   '100247a7-4519-4275-8282-46f3b8d6830e','1ce3902f-a915-4ac7-8485-51854f0d377f',
--   --   '24c1558f-49c7-4389-8adc-46252bca59da','2560d0fe-b746-491c-a6b2-9cd7a97a1cb9',
--   --   '26cf03b1-7b78-4a1d-bb6f-d3987c51e16d','31655646-d8cd-4ac4-9493-f25015999e25',
--   --   '32ccfcbc-e155-44a3-89c2-1be0fbf08c84','3593acc1-c621-4903-9ec0-9f0ea33c730e',
--   --   '3d02dd1d-4d72-4ceb-b552-35bbbee59158','3e731e09-d842-4ec5-9b9f-1a4e2234ad25',
--   --   '4e3aab74-05fb-49fe-be31-fc8d1bc02f04','613a980e-39de-457a-8f25-dab735fbf031',
--   --   '63f72412-2833-49fe-b691-543f46e0f26e','65b4c28c-1f37-403a-a6ee-1f03b813b721',
--   --   '673a856f-71b9-493d-a7cf-12b23761511e','7212cf36-ded4-4451-8e78-b24de7b85f5d',
--   --   '7ce1ba75-8ee6-45fa-b625-1bdd08d6cde2','7ce1d7c3-af44-419a-9207-9ad80340d623',
--   --   '9656178b-d74f-4058-a21f-54765afa7184','9a07d750-f63a-4619-9557-def55b35e075',
--   --   'a142b7ab-a959-407f-aa9f-d8503d2e6f70','ae9862e6-3fc7-47bf-9d17-52448b3d6142',
--   --   'b873734d-3173-44a5-b605-5866aa6a993f','bb2e4bd3-0dd6-4c69-9dac-960a7d12b7e2',
--   --   'd1acc43f-6c2e-4353-bcc2-7bd52827506a','d6d5deac-7183-45e5-85d5-1980f9515590',
--   --   'db9c0493-387e-4185-bfa7-d31467553a95','dd955780-cf91-477a-b0ca-f08f51c1e9f5',
--   --   'dec72974-d3a5-4c8e-a046-7b2f844c248d','df71af2c-b0f5-4037-a48c-7bf13c27f6ce',
--   --   'eb046b18-6ea3-4f09-a549-f34fb09cfd1f','f3874189-536f-4cc5-85e3-7f620f0b1ef4',
--   --   'f4201ae6-4b25-4ffd-b84e-fa8a68f73d9f'
--   -- idem com '"nao_determinado"' para: '1bcdb053-6a7a-4578-80f5-a4b65683573f',
--   --   '3246b928-ac07-4267-920a-a960add05397','3af6ac0c-b182-467e-a81d-dc0176ec2f87',
--   --   '5ac0495b-5d0b-4943-92ab-93df38f385b3','631dd3d1-73f5-429e-a227-934673c7df6e',
--   --   '6c0c6447-46f7-43e0-a5d7-6354b6454ae9','7e77959a-0dcb-4ad0-85e8-84b2a44fc4e7',
--   --   '95b04799-6a86-4702-9a29-8f25e24857bf','bf6a5075-b7bc-4ff3-8a2c-62ae17885426',
--   --   'c8d81714-6f4c-4fff-bf0c-8ec641f07e2e','ef3253d5-324d-4b2a-a58b-05d454fdfb25'

with classificado as (
  select c.id,
         case
           when not coalesce(
             (c.background_check_result->'processos_judiciais'->>'encontrado')::boolean, false)
             then 'baixo'
           when lower(translate(
                  coalesce(c.background_check_result->'processos_judiciais'->>'resumo','') || ' ' ||
                  coalesce((c.background_check_result->'processos_judiciais'->'detalhes')::text,''),
                  'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
                  'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
                ~ '(criminal|crime|penal|termo circunstanciado|inquerito|delito|contravencao)'
             then 'alto'
           when lower(translate(
                  coalesce(c.background_check_result->'processos_judiciais'->>'resumo','') || ' ' ||
                  coalesce((c.background_check_result->'processos_judiciais'->'detalhes')::text,''),
                  'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
                  'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
                ~ '(trabalhista|trabalho|reclamatoria|reclamante|trt|clt)'
             then 'alto'
           else 'medio'
         end as nivel_novo
  from public.candidates c
  where c.background_check_result is not null
)
update public.candidates c
set background_check_result =
      jsonb_set(c.background_check_result, '{nivel_risco}', to_jsonb(k.nivel_novo)),
    updated_at = now()
from classificado k
where c.id = k.id
  and c.background_check_result->>'nivel_risco' is distinct from k.nivel_novo;
