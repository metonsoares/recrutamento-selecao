import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { analisarCandidatura } from '@/lib/analise-ia'

/**
 * Fila das análises de IA.
 *
 * Antes, quem precisava de análise fazia `fetch(...)` sem await e torcia. Em
 * serverless isso não garante execução: a função que disparou pode terminar
 * antes, e aí ninguém fica sabendo que o parecer não saiu. Agora quem precisa
 * GRAVA UMA LINHA — escrita durável, dentro da própria requisição — e o worker
 * executa depois. O disparo imediato continua existindo, mas como atalho: se
 * falhar, o cron recolhe o job mais tarde.
 */

export type OrigemAnalise = 'curriculo' | 'teste_cultural' | 'pendentes' | 'manual'

/** Espera antes de tentar de novo. Cresce para não insistir em erro persistente. */
const ESPERA_POR_TENTATIVA = [2, 10, 30] // minutos

/**
 * Coloca a candidatura na fila. Idempotente: se já existe job vivo para ela,
 * não cria outro — o índice único parcial garante isso no banco, e o conflito
 * é tratado aqui como sucesso, porque o que importa é "está na fila".
 */
export async function enfileirarAnalise(
  applicationId: string,
  origem: OrigemAnalise = 'manual',
): Promise<{ ok: boolean; jaEstava?: boolean; erro?: string }> {
  if (!applicationId) return { ok: false, erro: 'applicationId vazio' }
  try {
    const supabase = await createSupabaseServiceClient()
    const { error } = await supabase
      .from('ai_analysis_jobs')
      .insert({ application_id: applicationId, origem })

    if (error) {
      if (error.code === '23505') return { ok: true, jaEstava: true }
      console.error('[fila-ia] enfileirar falhou:', error.message)
      return { ok: false, erro: error.message }
    }
    return { ok: true }
  } catch (e) {
    console.error('[fila-ia] enfileirar erro:', String(e))
    return { ok: false, erro: String(e) }
  }
}

/**
 * Fecha o job vivo de uma candidatura que já foi analisada por fora da fila
 * (o botão da ficha). Sem isso o worker refaria o mesmo trabalho e gastaria
 * crédito à toa.
 */
export async function concluirJobDaCandidatura(applicationId: string, provider?: string) {
  try {
    const supabase = await createSupabaseServiceClient()
    await supabase
      .from('ai_analysis_jobs')
      .update({ status: 'concluido', provider: provider ?? null, erro: null, updated_at: new Date().toISOString() })
      .eq('application_id', applicationId)
      .in('status', ['pendente', 'processando'])
  } catch (e) {
    // Não derruba a análise que já deu certo por causa da contabilidade da fila.
    console.error('[fila-ia] concluir job falhou:', String(e))
  }
}

export type ResumoProcessamento = {
  reivindicados: number
  concluidos: number
  falhados: number
  detalhes: Array<{ applicationId: string; ok: boolean; provider?: string; erro?: string; ms?: number }>
}

/**
 * Reivindica jobs e executa. Chamado pelo cron e, como atalho, logo depois de
 * enfileirar.
 *
 * A reivindicação é feita pela RPC `ai_fila_reivindicar`, que usa
 * `for update skip locked`: dois workers simultâneos nunca pegam o mesmo job, e
 * jobs de worker que morreu voltam sozinhos quando o `locked_until` vence.
 */
export async function processarFila(limite = 3): Promise<ResumoProcessamento> {
  const resumo: ResumoProcessamento = { reivindicados: 0, concluidos: 0, falhados: 0, detalhes: [] }
  const supabase = await createSupabaseServiceClient()

  const { data: jobs, error } = await supabase.rpc('ai_fila_reivindicar', { p_limite: limite })
  if (error) {
    console.error('[fila-ia] reivindicar falhou:', error.message)
    return resumo
  }

  const lista = (jobs ?? []) as Array<{
    id: string; application_id: string; tentativas: number; max_tentativas: number
  }>
  resumo.reivindicados = lista.length

  for (const job of lista) {
    const t0 = Date.now()
    let erro: string | null = null
    let provider: string | undefined

    try {
      const r = await analisarCandidatura(job.application_id)
      if (r.error) erro = `${r.step ?? 'analise'}: ${r.error}`
      else provider = r.provider
      // Fallback não é erro de execução — a análise rodou e gravou o que deu.
      // Marcar como falha faria o worker repetir e gastar crédito sem motivo.
    } catch (e) {
      erro = String(e)
    }

    const ms = Date.now() - t0

    if (!erro) {
      await supabase.from('ai_analysis_jobs').update({
        status: 'concluido', provider: provider ?? null, duracao_ms: ms,
        erro: null, locked_until: null, updated_at: new Date().toISOString(),
      }).eq('id', job.id)
      resumo.concluidos++
      resumo.detalhes.push({ applicationId: job.application_id, ok: true, provider, ms })
      continue
    }

    const esgotou = job.tentativas >= job.max_tentativas
    const esperaMin = ESPERA_POR_TENTATIVA[Math.min(job.tentativas - 1, ESPERA_POR_TENTATIVA.length - 1)] ?? 30
    await supabase.from('ai_analysis_jobs').update({
      status: esgotou ? 'falhou' : 'pendente',
      erro: erro.slice(0, 500),
      duracao_ms: ms,
      locked_until: null,
      proxima_tentativa_em: new Date(Date.now() + esperaMin * 60_000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', job.id)

    resumo.falhados++
    resumo.detalhes.push({ applicationId: job.application_id, ok: false, erro: erro.slice(0, 200), ms })
  }

  return resumo
}

/**
 * Atalho: enfileira e já cutuca o worker, sem esperar. Se a cutucada não
 * vingar, o job continua na fila e o cron pega — que é justamente a diferença
 * para o fire-and-forget de antes.
 */
export async function enfileirarEProcessar(applicationId: string, origem: OrigemAnalise) {
  const r = await enfileirarAnalise(applicationId, origem)
  if (!r.ok) return r
  processarFila(1).catch(e => console.error('[fila-ia] atalho falhou:', String(e)))
  return r
}
