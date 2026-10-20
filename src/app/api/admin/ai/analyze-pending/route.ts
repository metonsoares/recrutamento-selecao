import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requirePermissionApi } from '@/lib/auth-guard'
import { enfileirarAnalise, processarFila } from '@/lib/fila-ia'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST /api/admin/ai/analyze-pending
 *
 * Botão "Analisar pendentes" do quadro: enfileira todas as candidaturas ativas
 * sem nota final.
 *
 * Antes isto disparava um `fetch` sem await por candidatura, escalonado com
 * `setTimeout`. Em serverless nada disso sobrevive ao fim da requisição: a
 * resposta dizia "200 enfileiradas" e, na prática, a maioria podia nunca
 * rodar — e não havia como saber quais. Agora cada candidatura vira uma linha
 * na fila; o que não couber nesta rodada o cron recolhe depois.
 */
export async function POST(_req: NextRequest) {
  try {
    const denied = await requirePermissionApi('acao.analise_ia')
    if (denied) return denied

    const supabase = await createSupabaseServiceClient()

    const { data: apps, error } = await supabase
      .from('applications')
      .select('id, candidate_id, candidates!inner(deleted_at)')
      .eq('is_latest', true)
      .is('final_score', null)
      .is('candidates.deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      console.error('[analyze-pending] query error', error)
      return NextResponse.json({ error: 'Erro ao buscar candidaturas.' }, { status: 500 })
    }
    if (!apps || apps.length === 0) return NextResponse.json({ queued: 0 })

    let enfileiradas = 0
    for (const app of apps) {
      const r = await enfileirarAnalise(app.id as string, 'pendentes')
      if (r.ok && !r.jaEstava) enfileiradas++
    }

    // Adianta algumas enquanto quem clicou ainda está na tela; o resto fica
    // para o cron. A resposta diz o que foi enfileirado, não o que "rodou".
    const resumo = await processarFila(3)

    console.log(`[analyze-pending] ${enfileiradas} enfileiradas, ${resumo.concluidos} já concluídas`)
    return NextResponse.json({
      queued: enfileiradas,
      jaNaFila: apps.length - enfileiradas,
      processadasAgora: resumo.concluidos,
    })
  } catch (err) {
    console.error('[analyze-pending] error', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
