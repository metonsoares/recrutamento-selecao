import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient, createSupabaseServerClient } from '@/lib/supabase-server'
import { requireMasterApi } from '@/lib/auth-guard'

/**
 * Comentário por colaborador no Fechamento de folha.
 *
 * É a única coisa que a tela GRAVA: todo o resto é consolidação de dados que
 * já existem (dias do Vale transporte, faltas, gorjeta aprovada e as respostas
 * da ficha). Exclusivo do Master, igual à tela.
 */
export async function PUT(req: NextRequest) {
  try {
    const denied = await requireMasterApi()
    if (denied) return denied

    const body = await req.json().catch(() => ({}))
    const competencia = String(body.competencia ?? '')
    const candidateId = String(body.candidate_id ?? '')
    const comentario = String(body.comentario ?? '').slice(0, 2000)

    if (!/^\d{4}-\d{2}-01$/.test(competencia) || !candidateId) {
      return NextResponse.json({ error: 'Informe a competência e o colaborador.' }, { status: 400 })
    }

    const supabase = await createSupabaseServiceClient()
    const auth = await createSupabaseServerClient()
    const { data: { user } } = await auth.auth.getUser()

    // Comentário vazio não vira linha: apagar é o jeito de limpar.
    if (!comentario.trim()) {
      const { error } = await supabase.from('fechamento_comentarios')
        .delete().eq('competencia', competencia).eq('candidate_id', candidateId)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ ok: true, removido: true })
    }

    const { error } = await supabase.from('fechamento_comentarios').upsert({
      competencia,
      candidate_id: candidateId,
      comentario: comentario.trim(),
      autor: user?.email ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'competencia,candidate_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[fechamento comentario PUT]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
