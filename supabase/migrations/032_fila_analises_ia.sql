-- Fila persistente das análises de IA.
--
-- POR QUE
-- A análise era disparada com `fetch(...)` sem await — fire-and-forget — por
-- três lugares: o envio do currículo, o teste cultural e o analyze-pending
-- (que ainda usava setTimeout). Em serverless isso não garante nada: se a
-- função que disparou termina antes, ou se a chamada falha, ninguém fica
-- sabendo e o candidato simplesmente não tem parecer. Foi essa arquitetura que
-- permitiu a corrida que zerou 40 notas culturais (migration 030).
--
-- COMO FICA
-- Quem precisa de análise GRAVA UMA LINHA aqui — escrita durável, dentro da
-- mesma requisição. Um worker reivindica os jobs com trava e executa. Se o
-- worker morrer no meio, o `locked_until` vence e o job volta para a fila
-- sozinho. O cron passa de tempos em tempos e recolhe o que ficou para trás.

create table if not exists public.ai_analysis_jobs (
  id                   uuid primary key default gen_random_uuid(),
  application_id       uuid not null references public.applications(id) on delete cascade,
  -- de onde veio: curriculo | teste_cultural | pendentes | manual
  origem               text not null default 'manual',
  -- pendente | processando | concluido | falhou
  status               text not null default 'pendente',
  tentativas           int  not null default 0,
  max_tentativas       int  not null default 3,
  -- enquanto não vencer, o job é de quem o reivindicou
  locked_until         timestamptz,
  -- espera entre tentativas (backoff)
  proxima_tentativa_em timestamptz not null default now(),
  erro                 text,
  provider             text,
  duracao_ms           int,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Um job VIVO por candidatura. Dois pedidos para a mesma pessoa (currículo e
-- teste cultural chegam em seguida) viram um só — analisar duas vezes em
-- paralelo gastaria crédito e as duas execuções brigariam pela mesma linha.
create unique index if not exists ai_analysis_jobs_vivo_unico
  on public.ai_analysis_jobs (application_id)
  where status in ('pendente', 'processando');

create index if not exists ai_analysis_jobs_fila
  on public.ai_analysis_jobs (status, proxima_tentativa_em);

alter table public.ai_analysis_jobs enable row level security;

comment on table public.ai_analysis_jobs is
  'Fila das análises de IA: quem precisa de parecer grava aqui; o worker executa.';

-- RLS ligada e ZERO policy: nega tudo para anon e authenticated. Só o service
-- role (servidor) enxerga a fila, que é exatamente quem precisa.

/**
 * Reivindica até `p_limite` jobs para execução.
 *
 * `for update skip locked` é o que permite mais de um worker ao mesmo tempo sem
 * dois pegarem o mesmo job: quem chega depois pula a linha travada em vez de
 * esperar. Recolhe também os `processando` cujo `locked_until` venceu — esses
 * são jobs de um worker que morreu no meio.
 */
create or replace function public.ai_fila_reivindicar(p_limite int default 3)
returns setof public.ai_analysis_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.ai_analysis_jobs j
  set status       = 'processando',
      locked_until = now() + interval '5 minutes',
      tentativas   = j.tentativas + 1,
      updated_at   = now()
  where j.id in (
    select id
    from public.ai_analysis_jobs
    where (status = 'pendente'    and proxima_tentativa_em <= now())
       or (status = 'processando' and locked_until < now())
    order by proxima_tentativa_em
    for update skip locked
    limit greatest(p_limite, 1)
  )
  returning j.*;
end;
$$;

-- O Supabase concede EXECUTE por padrão (ALTER DEFAULT PRIVILEGES), então
-- revogar de `public` e `anon` não basta: `authenticated` precisa ser nomeado.
revoke all on function public.ai_fila_reivindicar(int) from public;
revoke all on function public.ai_fila_reivindicar(int) from anon;
revoke all on function public.ai_fila_reivindicar(int) from authenticated;
