import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient, createSupabaseServerClient } from '@/lib/supabase-server'
import { requireMasterApi } from '@/lib/auth-guard'

/**
 * Fechamento de folha. A tela é consolidação: o que ela grava é só a APROVAÇÃO
 * do mês (POST) e o comentário por colaborador (PUT). Exclusivo do Master.
 */

/**
 * POST — aprova o fechamento do mês. Guarda um retrato dos totais no instante
 * da aprovação: se um lançamento mudar depois, dá para ver que o fechamento
 * aprovado era outro.
 */
export async function POST(req: NextRequest) {
  try {
    const denied = await requireMasterApi()
    if (denied) return denied

    const body = await req.json().catch(() => ({}))
    const competencia = String(body.competencia ?? '')
    if (!/^\d{4}-\d{2}-01$/.test(competencia)) {
      return NextResponse.json({ error: 'Competência inválida.' }, { status: 400 })
    }

    const supabase = await createSupabaseServiceClient()
    const auth = await createSupabaseServerClient()
    const { data: { user } } = await auth.auth.getUser()

    const inteiro = (v: unknown) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) && n >= 0 ? n : 0 }
    const dinheiro = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0 }

    const { error } = await supabase.from('fechamento_ciclos').upsert({
      competencia,
      colaboradores: inteiro(body.colaboradores),
      total_dias: inteiro(body.total_dias),
      total_faltas: inteiro(body.total_faltas),
      total_gorjeta: dinheiro(body.total_gorjeta),
      total_salario: dinheiro(body.total_salario),
      aprovado_por: user?.email ?? null,
      aprovado_em: new Date().toISOString(),
    }, { onConflict: 'competencia' })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[fechamento POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/** PUT — comentário por colaborador. Vazio apaga o registro. */
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
