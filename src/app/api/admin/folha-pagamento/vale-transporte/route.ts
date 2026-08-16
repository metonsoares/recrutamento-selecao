import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient, createSupabaseServerClient } from '@/lib/supabase-server'
import { requireMasterApi } from '@/lib/auth-guard'

interface ItemEntrada {
  candidate_id: string
  nome: string
  cargo?: string | null
  empresa_id?: string | null
  empresa_nome?: string | null
  dias: number
}

/** Recalcula o total de dias do ciclo; apaga o ciclo se ficar vazio. */
async function recalcular(
  supabase: Awaited<ReturnType<typeof createSupabaseServiceClient>>,
  cicloId: string,
): Promise<{ removido: boolean; total: number }> {
  const { data: restantes } = await supabase
    .from('vt_itens').select('dias').eq('ciclo_id', cicloId)

  if (!restantes || restantes.length === 0) {
    await supabase.from('vt_ciclos').delete().eq('id', cicloId)
    return { removido: true, total: 0 }
  }
  const total = restantes.reduce((s, i) => s + Number(i.dias), 0)
  await supabase.from('vt_ciclos')
    .update({ total_dias: total, updated_at: new Date().toISOString() })
    .eq('id', cicloId)
  return { removido: false, total }
}

/** Dias válidos: inteiro de 1 a 31. */
function diasValidos(v: unknown): number {
  const n = Math.trunc(Number(v))
  return Number.isFinite(n) && n > 0 && n <= 31 ? n : 0
}

/** POST — aprova (ou reaprova) os dias trabalhados de uma competência. */
export async function POST(req: NextRequest) {
  try {
    const denied = await requireMasterApi()
    if (denied) return denied

    const body = await req.json().catch(() => ({}))
    const competencia = String(body.competencia ?? '')
    if (!/^\d{4}-\d{2}-01$/.test(competencia)) {
      return NextResponse.json({ error: 'Competência inválida.' }, { status: 400 })
    }
    const itens = Array.isArray(body.itens) ? (body.itens as ItemEntrada[]) : []
    if (itens.length === 0) {
      return NextResponse.json({ error: 'Nenhum colaborador para aprovar.' }, { status: 400 })
    }

    const supabase = await createSupabaseServiceClient()
    const auth = await createSupabaseServerClient()
    const { data: { user } } = await auth.auth.getUser()

    const { data: ciclo, error: erroCiclo } = await supabase
      .from('vt_ciclos')
      .upsert({
        competencia,
        dias_padrao: diasValidos(body.dias_padrao),
        aprovado_por: user?.email ?? null,
        aprovado_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'competencia' })
      .select()
      .single()
    if (erroCiclo) return NextResponse.json({ error: erroCiclo.message }, { status: 400 })

    // Com filtro de empresa, substitui SÓ aquela empresa; sem filtro, o mês todo.
    const escopoEmpresa = body.escopo_empresa ? String(body.escopo_empresa) : null
    if (escopoEmpresa) {
      await supabase.from('vt_itens').delete().eq('ciclo_id', ciclo.id).eq('empresa_id', escopoEmpresa)
    } else {
      await supabase.from('vt_itens').delete().eq('ciclo_id', ciclo.id)
    }

    const linhas = itens
      .map(i => ({ ...i, dias: diasValidos(i.dias) }))
      .filter(i => i.candidate_id && i.dias > 0)
      .map(i => ({
        ciclo_id: ciclo.id as string,
        candidate_id: i.candidate_id,
        nome: i.nome,
        cargo: i.cargo ?? null,
        empresa_id: i.empresa_id || null,
        empresa_nome: i.empresa_nome ?? null,
        dias: i.dias,
      }))

    if (linhas.length > 0) {
      const { error } = await supabase.from('vt_itens').insert(linhas)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const { total } = await recalcular(supabase, ciclo.id as string)
    return NextResponse.json({ ok: true, aprovados: linhas.length, total_dias: total })
  } catch (err) {
    console.error('[vale-transporte POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/** PATCH — altera os dias de um colaborador num mês já aprovado. */
export async function PATCH(req: NextRequest) {
  try {
    const denied = await requireMasterApi()
    if (denied) return denied

    const body = await req.json().catch(() => ({}))
    const candidateId = String(body.candidate_id ?? '')
    const competencia = String(body.competencia ?? '')
    const dias = diasValidos(body.dias)
    if (!candidateId || !/^\d{4}-\d{2}-01$/.test(competencia)) {
      return NextResponse.json({ error: 'Informe o colaborador e a competência.' }, { status: 400 })
    }
    if (dias === 0) {
      return NextResponse.json({ error: 'Informe de 1 a 31 dias.' }, { status: 400 })
    }

    const supabase = await createSupabaseServiceClient()
    const { data: ciclo } = await supabase
      .from('vt_ciclos').select('id').eq('competencia', competencia).maybeSingle()
    if (!ciclo) return NextResponse.json({ error: 'Fechamento não encontrado.' }, { status: 404 })

    const { error } = await supabase.from('vt_itens')
      .update({ dias }).eq('ciclo_id', ciclo.id).eq('candidate_id', candidateId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const { total } = await recalcular(supabase, ciclo.id as string)
    return NextResponse.json({ ok: true, total_dias: total })
  } catch (err) {
    console.error('[vale-transporte PATCH]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/** DELETE — remove o registro de dias de um colaborador na competência. */
export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireMasterApi()
    if (denied) return denied

    const body = await req.json().catch(() => ({}))
    const candidateId = String(body.candidate_id ?? '')
    const competencia = String(body.competencia ?? '')
    if (!candidateId || !/^\d{4}-\d{2}-01$/.test(competencia)) {
      return NextResponse.json({ error: 'Informe o colaborador e a competência.' }, { status: 400 })
    }

    const supabase = await createSupabaseServiceClient()
    const { data: ciclo } = await supabase
      .from('vt_ciclos').select('id').eq('competencia', competencia).maybeSingle()
    if (!ciclo) return NextResponse.json({ error: 'Fechamento não encontrado.' }, { status: 404 })

    const { error } = await supabase.from('vt_itens').delete()
      .eq('ciclo_id', ciclo.id).eq('candidate_id', candidateId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const { removido } = await recalcular(supabase, ciclo.id as string)
    return NextResponse.json({ ok: true, ciclo_removido: removido })
  } catch (err) {
    console.error('[vale-transporte DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
