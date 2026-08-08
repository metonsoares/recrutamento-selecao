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
}

/**
 * POST — aprova (ou reaprova) o fechamento do Prêmio Caju de uma competência.
 * Grava um snapshot dos premiados: se o cadastro do colaborador mudar depois,
 * o histórico do mês continua fiel ao que foi aprovado. Somente Master.
 */
export async function POST(req: NextRequest) {
  try {
    const denied = await requireMasterApi()
    if (denied) return denied

    const body = await req.json().catch(() => ({}))
    const competencia = String(body.competencia ?? '')       // yyyy-mm-01
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

    const total = itens.reduce((s, i) => s + (Number(i.valor) || 0), 0)

    // Ciclo da competência (reaprovar sobrescreve o fechamento anterior).
    const { data: ciclo, error: erroCiclo } = await supabase
      .from('premio_caju_ciclos')
      .upsert({
        competencia,
        valor_padrao: Number.isFinite(valorPadrao) ? valorPadrao : 0,
        total: Math.round(total * 100) / 100,
        aprovado_por: user?.email ?? null,
        aprovado_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'competencia' })
      .select()
      .single()
    if (erroCiclo) return NextResponse.json({ error: erroCiclo.message }, { status: 400 })

    // Reaprovação: se veio com filtro de empresa, substitui SÓ aquela empresa —
    // sem o filtro, substitui o mês inteiro. Antes apagava tudo e aprovar uma
    // segunda empresa zerava a primeira.
    const escopoEmpresa = body.escopo_empresa ? String(body.escopo_empresa) : null
    if (escopoEmpresa) {
      await supabase.from('premio_caju_itens')
        .delete().eq('ciclo_id', ciclo.id).eq('empresa_id', escopoEmpresa)
    } else {
      await supabase.from('premio_caju_itens').delete().eq('ciclo_id', ciclo.id)
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
      }))

    if (linhas.length > 0) {
      const { error } = await supabase.from('premio_caju_itens').insert(linhas)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Total do ciclo = mês inteiro (pode ter sido aprovado empresa por empresa).
    const { data: todos } = await supabase
      .from('premio_caju_itens').select('valor').eq('ciclo_id', ciclo.id)
    const totalMes = (todos ?? []).reduce((s, i) => s + Number(i.valor), 0)
    await supabase.from('premio_caju_ciclos')
      .update({ total: Math.round(totalMes * 100) / 100 })
      .eq('id', ciclo.id)

    return NextResponse.json({ ok: true, aprovados: linhas.length, total, total_mes: totalMes })
  } catch (err) {
    console.error('[premio-caju POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
