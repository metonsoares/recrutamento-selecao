import { NextRequest, NextResponse } from 'next/server'
import { requireAnyRoleApi } from '@/lib/auth-guard'
import {
  abrirSessaoRhid, listarPessoas, diasTrabalhados, periodoDaCompetencia,
  cpfNormalizado, ErroRhid,
} from '@/lib/rhid'

// A apuração de 165 pessoas leva ~20s no RHiD; o lote é feito em série.
export const maxDuration = 120

interface Pedido { candidate_id: string; cpf?: string | null; nome?: string | null }

/**
 * POST — busca no RHiD (Control iD) os dias trabalhados do mês para os
 * colaboradores enviados. SOMENTE LEITURA: nada é gravado no RHiD.
 * O período é sempre do primeiro ao último dia da competência.
 *
 * Body: { competencia: 'yyyy-mm-01', colaboradores: [{candidate_id, cpf, nome}] }
 */
export async function POST(req: NextRequest) {
  try {
    const denied = await requireAnyRoleApi(['master', 'gestor_rh'])
    if (denied) return denied

    const body = await req.json().catch(() => ({}))
    const competencia = String(body.competencia ?? '')
    if (!/^\d{4}-\d{2}-01$/.test(competencia)) {
      return NextResponse.json({ error: 'Competência inválida.' }, { status: 400 })
    }

    const pedidos = (Array.isArray(body.colaboradores) ? body.colaboradores : []) as Pedido[]
    const comCpf = pedidos
      .map(p => ({ ...p, cpf: cpfNormalizado(p.cpf) }))
      .filter(p => p.candidate_id && p.cpf.length === 11 && Number(p.cpf) > 0)

    const semCpf = pedidos
      .filter(p => cpfNormalizado(p.cpf).length !== 11 || Number(cpfNormalizado(p.cpf)) === 0)
      .map(p => p.nome || p.candidate_id)

    if (comCpf.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum colaborador da lista tem CPF cadastrado — sem CPF não dá para casar com o RHiD.' },
        { status: 400 },
      )
    }

    const sessao = await abrirSessaoRhid()
    const pessoas = await listarPessoas(sessao)

    // CPF é a chave: o RHiD não conhece o id do nosso app.
    const idPorCpf = new Map<string, number>()
    for (const p of pessoas) if (!idPorCpf.has(p.cpf)) idPorCpf.set(p.cpf, p.id)

    const casados = comCpf
      .map(p => ({ ...p, rhidId: idPorCpf.get(p.cpf) }))
      .filter(p => p.rhidId != null) as (Pedido & { cpf: string; rhidId: number })[]

    const naoEncontrados = comCpf
      .filter(p => !idPorCpf.has(p.cpf))
      .map(p => p.nome || p.cpf)

    if (casados.length === 0) {
      return NextResponse.json({
        error: 'Nenhum dos colaboradores listados foi encontrado no RHiD pelo CPF.',
        nao_encontrados: naoEncontrados,
      }, { status: 404 })
    }

    const { ini, fim } = periodoDaCompetencia(competencia)
    const ids = Array.from(new Set(casados.map(p => p.rhidId)))
    const porId = await diasTrabalhados(sessao, ids, ini, fim)

    const dias: Record<string, number> = {}
    for (const p of casados) dias[p.candidate_id] = porId.get(p.rhidId) ?? 0

    return NextResponse.json({
      ok: true,
      periodo: { ini, fim },
      dias,
      encontrados: casados.length,
      nao_encontrados: naoEncontrados,
      sem_cpf: semCpf,
    })
  } catch (err) {
    if (err instanceof ErroRhid) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    if ((err as Error)?.name === 'AbortError') {
      return NextResponse.json({ error: 'O RHiD demorou demais para responder. Tente de novo.' }, { status: 504 })
    }
    console.error('[vale-transporte rhid POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
