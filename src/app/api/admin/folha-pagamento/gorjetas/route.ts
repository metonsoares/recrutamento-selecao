import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient, createSupabaseServerClient } from '@/lib/supabase-server'
import { requireMasterApi } from '@/lib/auth-guard'

interface ItemEntrada {
  candidate_id: string
  nome: string
  cargo?: string | null
  empresa_id?: string | null
  empresa_nome?: string | null
  valor: number
  peso?: number
  dias?: number
  fator?: number
}

/** Recalcula o total do ciclo; apaga o ciclo se não sobrar ninguém. */
async function recalcular(
  supabase: Awaited<ReturnType<typeof createSupabaseServiceClient>>,
  cicloId: string,
): Promise<{ removido: boolean; total: number }> {
  const { data: restantes } = await supabase
    .from('gorjeta_itens').select('valor').eq('ciclo_id', cicloId)

  if (!restantes || restantes.length === 0) {
    await supabase.from('gorjeta_ciclos').delete().eq('id', cicloId)
    return { removido: true, total: 0 }
  }
  const total = restantes.reduce((s, i) => s + Number(i.valor), 0)
  await supabase.from('gorjeta_ciclos')
    .update({ total: Math.round(total * 100) / 100, updated_at: new Date().toISOString() })
    .eq('id', cicloId)
  return { removido: false, total }
}

/** POST — aprova (ou reaprova) o fechamento de gorjetas de uma competência. */
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

    const valorPadrao = Number(body.valor_padrao)
    const supabase = await createSupabaseServiceClient()

    const auth = await createSupabaseServerClient()
    const { data: { user } } = await auth.auth.getUser()

    const { data: ciclo, error: erroCiclo } = await supabase
      .from('gorjeta_ciclos')
      .upsert({
        competencia,
        valor_padrao: Number.isFinite(valorPadrao) ? valorPadrao : 0,
        total_apurado: Number.isFinite(valorPadrao) ? valorPadrao : 0,
        retencao_pct: Number.isFinite(Number(body.retencao_pct)) ? Number(body.retencao_pct) : 27,
        descontos: Number(body.descontos) || 0,
        liquido: Number(body.liquido) || 0,
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
      await supabase.from('gorjeta_itens')
        .delete().eq('ciclo_id', ciclo.id).eq('empresa_id', escopoEmpresa)
    } else {
      await supabase.from('gorjeta_itens').delete().eq('ciclo_id', ciclo.id)
    }

    const linhas = itens
      .filter(i => i.candidate_id && Number(i.valor) > 0)
      .map(i => ({
        ciclo_id: ciclo.id as string,
        candidate_id: i.candidate_id,
        nome: i.nome,
        cargo: i.cargo ?? null,
        empresa_id: i.empresa_id || null,
        empresa_nome: i.empresa_nome ?? null,
        valor: Math.round((Number(i.valor) || 0) * 100) / 100,
        peso: Number(i.peso) > 0 ? Number(i.peso) : 1,
        dias: Math.trunc(Number(i.dias)) || 0,
        fator: Number(i.fator) || 0,
      }))

    if (linhas.length > 0) {
      const { error } = await supabase.from('gorjeta_itens').insert(linhas)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const { total } = await recalcular(supabase, ciclo.id as string)
    return NextResponse.json({ ok: true, aprovados: linhas.length, total })
  } catch (err) {
    console.error('[gorjetas POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/** PATCH — altera o valor de um colaborador num mês já aprovado. */
export async function PATCH(req: NextRequest) {
  try {
    const denied = await requireMasterApi()
    if (denied) return denied

    const body = await req.json().catch(() => ({}))
    const candidateId = String(body.candidate_id ?? '')
    const competencia = String(body.competencia ?? '')
    const valor = Number(body.valor)
    if (!candidateId || !/^\d{4}-\d{2}-01$/.test(competencia)) {
      return NextResponse.json({ error: 'Informe o colaborador e a competência.' }, { status: 400 })
    }
    if (!Number.isFinite(valor) || valor <= 0) {
      return NextResponse.json({ error: 'Valor inválido.' }, { status: 400 })
    }

    const supabase = await createSupabaseServiceClient()
    const { data: ciclo } = await supabase
      .from('gorjeta_ciclos').select('id').eq('competencia', competencia).maybeSingle()
    if (!ciclo) return NextResponse.json({ error: 'Fechamento não encontrado.' }, { status: 404 })

    const { error } = await supabase.from('gorjeta_itens')
      .update({ valor: Math.round(valor * 100) / 100 })
      .eq('ciclo_id', ciclo.id).eq('candidate_id', candidateId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const { total } = await recalcular(supabase, ciclo.id as string)
    return NextResponse.json({ ok: true, total_mes: total })
  } catch (err) {
    console.error('[gorjetas PATCH]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/** DELETE — remove a gorjeta de um colaborador numa competência. */
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
      .from('gorjeta_ciclos').select('id').eq('competencia', competencia).maybeSingle()
    if (!ciclo) return NextResponse.json({ error: 'Fechamento não encontrado.' }, { status: 404 })

    const { error } = await supabase.from('gorjeta_itens').delete()
      .eq('ciclo_id', ciclo.id).eq('candidate_id', candidateId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const { removido } = await recalcular(supabase, ciclo.id as string)
    return NextResponse.json({ ok: true, ciclo_removido: removido })
  } catch (err) {
    console.error('[gorjetas DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
