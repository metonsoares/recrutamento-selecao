import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

/**
 * POST /api/admin/ai/analyze-pending
 *
 * Encontra todas as candidaturas ativas sem nota final (final_score IS NULL)
 * e dispara análise IA para cada uma de forma assíncrona (fire-and-forget).
 * Retorna { queued: N } imediatamente.
 */
export async function POST(_req: NextRequest) {
  try {
    const supabase = await createSupabaseServiceClient()

    // Busca candidaturas mais recentes sem análise concluída
    const { data: apps, error } = await supabase
      .from('applications')
      .select('id, candidate_id, candidates!inner(deleted_at)')
      .eq('is_latest', true)
      .is('final_score', null)
      .is('candidates.deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200)   // segurança: máximo 200 por vez

    if (error) {
      console.error('[analyze-pending] query error', error)
      return NextResponse.json({ error: 'Erro ao buscar candidaturas.' }, { status: 500 })
    }

    if (!apps || apps.length === 0) {
      return NextResponse.json({ queued: 0 })
    }

    const baseUrl = process.env.APP_URL || 'http://localhost:3000'

    // Dispara análises com escalonamento (200ms entre cada) para não sobrecarregar a API de IA
    apps.forEach((app, i) => {
      setTimeout(() => {
        fetch(`${baseUrl}/api/admin/ai/analyze-candidate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ applicationId: app.id }),
        }).catch(() => {})
      }, i * 200)
    })

    console.log(`[analyze-pending] Disparadas ${apps.length} análises`)
    return NextResponse.json({ queued: apps.length })
  } catch (err) {
    console.error('[analyze-pending] error', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
