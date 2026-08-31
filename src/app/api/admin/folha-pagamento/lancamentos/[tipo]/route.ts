import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient, createSupabaseServerClient } from '@/lib/supabase-server'
import { requireMasterApi } from '@/lib/auth-guard'
import { tipoValido } from '@/lib/folha-lancamentos'

/**
 * Fechamento mensal dos lançamentos de folha (avarias, domingos e feriados,
 * horas extras, gratificação, cargo de confiança, insalubridade, quebra de
 * caixa). Uma rota para os sete: o tipo vem na URL.
 */

interface ItemEntrada {
  candidate_id: string
  nome: string
  cargo?: string | null
  empresa_id?: string | null
  empresa_nome?: string | null
  quantidade?: unknown
  quantidade2?: unknown
  quantidade3?: unknown
  valor?: unknown
  observacao?: string | null
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0
}

/** Recalcula os totais do ciclo; apaga o ciclo se ficar vazio. */
async function recalcular(
  supabase: Awaited<ReturnType<typeof createSupabaseServiceClient>>,
  cicloId: string,
) {
  const { data: restantes } = await supabase
    .from('folha_itens').select('quantidade, quantidade2, quantidade3, valor').eq('ciclo_id', cicloId)

  if (!restantes || restantes.length === 0) {
    await supabase.from('folha_ciclos').delete().eq('id', cicloId)
    return { removido: true, totalValor: 0, totalQtd: 0, totalQtd2: 0, totalQtd3: 0 }
  }
  const totalValor = Math.round(restantes.reduce((s, i) => s + Number(i.valor), 0) * 100) / 100
  const totalQtd = Math.round(restantes.reduce((s, i) => s + Number(i.quantidade), 0) * 100) / 100
  const totalQtd2 = Math.round(restantes.reduce((s, i) => s + Number(i.quantidade2 ?? 0), 0) * 100) / 100
  const totalQtd3 = Math.round(restantes.reduce((s, i) => s + Number(i.quantidade3 ?? 0), 0) * 100) / 100
  await supabase.from('folha_ciclos')
    .update({
      total_valor: totalValor, total_qtd: totalQtd, total_qtd2: totalQtd2, total_qtd3: totalQtd3,
      updated_at: new Date().toISOString(),
    })
    .eq('id', cicloId)
  return { removido: false, totalValor, totalQtd, totalQtd2, totalQtd3 }
}

/** POST — aprova (ou reaprova) a competência. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ tipo: string }> }) {
  try {
    const denied = await requireMasterApi()
    if (denied) return denied

    const { tipo } = await params
    if (!tipoValido(tipo)) return NextResponse.json({ error: 'Tipo inválido.' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const competencia = String(body.competencia ?? '')
    if (!/^\d{4}-\d{2}-01$/.test(competencia)) {
      return NextResponse.json({ error: 'Competência inválida.' }, { status: 400 })
    }

    const itens = (Array.isArray(body.itens) ? body.itens : []) as ItemEntrada[]
    const supabase = await createSupabaseServiceClient()
    const auth = await createSupabaseServerClient()
    const { data: { user } } = await auth.auth.getUser()

    const { data: ciclo, error: erroCiclo } = await supabase
      .from('folha_ciclos')
      .upsert({
        tipo,
        competencia,
        aprovado_por: user?.email ?? null,
        aprovado_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tipo,competencia' })
      .select()
      .single()
    if (erroCiclo) return NextResponse.json({ error: erroCiclo.message }, { status: 400 })

    // Com filtro de empresa, substitui SÓ aquela empresa; sem filtro, o mês
    // todo. Mandar a lista visível (que inclui a busca por nome) apagaria o
    // resto do fechamento — foi assim que gorjetas e prêmio caju já erraram.
    const escopoEmpresa = body.escopo_empresa ? String(body.escopo_empresa) : null
    if (escopoEmpresa) {
      await supabase.from('folha_itens').delete().eq('ciclo_id', ciclo.id).eq('empresa_id', escopoEmpresa)
    } else {
      await supabase.from('folha_itens').delete().eq('ciclo_id', ciclo.id)
    }

    const linhas = itens
      .map(i => ({
        ciclo_id: ciclo.id as string,
        candidate_id: i.candidate_id,
        nome: i.nome,
        cargo: i.cargo ?? null,
        empresa_id: i.empresa_id || null,
        empresa_nome: i.empresa_nome ?? null,
        quantidade: num(i.quantidade),
        quantidade2: num(i.quantidade2),
        quantidade3: num(i.quantidade3),
        valor: num(i.valor),
        observacao: String(i.observacao ?? '').trim() || null,
      }))
      .filter(l => l.candidate_id && (l.valor > 0 || l.quantidade > 0 || l.quantidade2 > 0 || l.quantidade3 > 0))

    if (linhas.length > 0) {
      const { error } = await supabase.from('folha_itens').insert(linhas)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const totais = await recalcular(supabase, ciclo.id as string)
    return NextResponse.json({ ok: true, aprovados: linhas.length, ...totais })
  } catch (err) {
    console.error('[folha lancamentos POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/** PATCH — altera um lançamento de um mês já aprovado. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tipo: string }> }) {
  try {
    const denied = await requireMasterApi()
    if (denied) return denied

    const { tipo } = await params
    if (!tipoValido(tipo)) return NextResponse.json({ error: 'Tipo inválido.' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const competencia = String(body.competencia ?? '')
    const candidateId = String(body.candidate_id ?? '')
    if (!/^\d{4}-\d{2}-01$/.test(competencia) || !candidateId) {
      return NextResponse.json({ error: 'Informe o colaborador e a competência.' }, { status: 400 })
    }

    const valor = num(body.valor)
    const quantidade = num(body.quantidade)
    const quantidade2 = num(body.quantidade2)
    const quantidade3 = num(body.quantidade3)
    if (valor <= 0 && quantidade <= 0 && quantidade2 <= 0 && quantidade3 <= 0) {
      return NextResponse.json({ error: 'Informe um valor ou uma quantidade.' }, { status: 400 })
    }

    const supabase = await createSupabaseServiceClient()
    const { data: ciclo } = await supabase.from('folha_ciclos')
      .select('id').eq('tipo', tipo).eq('competencia', competencia).maybeSingle()
    if (!ciclo) return NextResponse.json({ error: 'Fechamento não encontrado.' }, { status: 404 })

    const { error } = await supabase.from('folha_itens')
      .update({ valor, quantidade, quantidade2, quantidade3 })
      .eq('ciclo_id', ciclo.id).eq('candidate_id', candidateId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const totais = await recalcular(supabase, ciclo.id as string)
    return NextResponse.json({ ok: true, ...totais })
  } catch (err) {
    console.error('[folha lancamentos PATCH]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/** DELETE — remove o lançamento de um colaborador na competência. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ tipo: string }> }) {
  try {
    const denied = await requireMasterApi()
    if (denied) return denied

    const { tipo } = await params
    if (!tipoValido(tipo)) return NextResponse.json({ error: 'Tipo inválido.' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const competencia = String(body.competencia ?? '')
    const candidateId = String(body.candidate_id ?? '')
    if (!/^\d{4}-\d{2}-01$/.test(competencia) || !candidateId) {
      return NextResponse.json({ error: 'Informe o colaborador e a competência.' }, { status: 400 })
    }

    const supabase = await createSupabaseServiceClient()
    const { data: ciclo } = await supabase.from('folha_ciclos')
      .select('id').eq('tipo', tipo).eq('competencia', competencia).maybeSingle()
    if (!ciclo) return NextResponse.json({ error: 'Fechamento não encontrado.' }, { status: 404 })

    const { error } = await supabase.from('folha_itens').delete()
      .eq('ciclo_id', ciclo.id).eq('candidate_id', candidateId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const totais = await recalcular(supabase, ciclo.id as string)
    return NextResponse.json({ ok: true, ...totais })
  } catch (err) {
    console.error('[folha lancamentos DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
