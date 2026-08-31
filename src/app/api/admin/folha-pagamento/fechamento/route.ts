import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient, createSupabaseServerClient } from '@/lib/supabase-server'
import { requireMasterApi } from '@/lib/auth-guard'
import { montarFechamento, LinhaFechamento } from '@/lib/fechamento-folha'

/**
 * Fechamento de folha. A tela é consolidação: o que ela grava é a APROVAÇÃO
 * (POST) e o comentário por colaborador (PUT). Exclusivo do Master.
 *
 * A aprovação é POR EMPRESA dentro do mês — as empresas fecham em ritmos
 * diferentes — e guarda o retrato de cada colaborador aprovado em
 * fechamento_itens.
 */

/** "R$ 1.892,34" → 1892.34 */
function paraNumero(v: string | null): number {
  if (!v) return 0
  return Number(String(v).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0
}

/**
 * POST — aprova o fechamento das empresas em escopo.
 *
 * O cliente manda só quem está marcado; os números vêm da mesma montagem que
 * a tela desenha, calculada AQUI. Confiar nos totais do navegador deixaria a
 * folha aprovada valer o que o console mandasse.
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

    const escolhidos = new Set(
      (Array.isArray(body.candidate_ids) ? body.candidate_ids : []).map(String),
    )
    // Sem empresa em escopo, lista vazia apagaria o mês inteiro sem querer.
    // Com escopo, desmarcar todo mundo é o jeito de tirar aquela empresa da
    // folha — intenção explícita, não acidente.
    const escopoEmpresa = body.escopo_empresa ? String(body.escopo_empresa) : null
    if (escolhidos.size === 0 && !escopoEmpresa) {
      return NextResponse.json({ error: 'Marque ao menos um colaborador.' }, { status: 400 })
    }

    const supabase = await createSupabaseServiceClient()
    const auth = await createSupabaseServerClient()
    const { data: { user } } = await auth.auth.getUser()

    const { linhas } = await montarFechamento(competencia)

    // Com filtro de empresa, aprova SÓ aquela; sem filtro, todas as empresas
    // do mês. O escopo é o que pode ser apagado quando ninguém sobra marcado.
    const escopo: (string | null)[] = escopoEmpresa
      ? [escopoEmpresa]
      : Array.from(new Set(linhas.map(l => l.empresa_id ?? null)))

    const aprovadas: { empresa: string; colaboradores: number }[] = []
    let removidas = 0

    for (const empresaId of escopo) {
      const doGrupo = linhas.filter(
        l => (l.empresa_id ?? null) === empresaId && escolhidos.has(l.candidate_id),
      )

      const filtroCiclo = supabase.from('fechamento_ciclos').select('id').eq('competencia', competencia)
      const { data: cicloAtual } = await (empresaId
        ? filtroCiclo.eq('empresa_id', empresaId)
        : filtroCiclo.is('empresa_id', null)).maybeSingle()

      // Empresa sem ninguém marcado deixa de ter folha aprovada no mês —
      // é assim que o Master desfaz uma aprovação inteira.
      if (doGrupo.length === 0) {
        if (cicloAtual?.id) {
          await supabase.from('fechamento_ciclos').delete().eq('id', cicloAtual.id)
          removidas++
        }
        continue
      }

      const totais = totalizar(doGrupo)
      const registro = {
        competencia,
        empresa_id: empresaId,
        empresa_nome: doGrupo[0].empresa ?? null,
        ...totais,
        aprovado_por: user?.email ?? null,
        aprovado_em: new Date().toISOString(),
      }

      let cicloId = cicloAtual?.id as string | undefined
      if (cicloId) {
        const { error } = await supabase.from('fechamento_ciclos').update(registro).eq('id', cicloId)
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      } else {
        const { data, error } = await supabase.from('fechamento_ciclos').insert(registro).select('id').single()
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
        cicloId = data.id as string
      }

      // Substitui o retrato inteiro: reaprovar é sempre "vale o de agora".
      await supabase.from('fechamento_itens').delete().eq('ciclo_id', cicloId)
      const { error: erroItens } = await supabase.from('fechamento_itens').insert(
        doGrupo.map(l => ({
          ciclo_id: cicloId,
          candidate_id: l.candidate_id,
          nome: l.nome,
          cargo: l.cargo,
          vinculo: l.vinculo,
          dias_trabalhados: l.dias_trabalhados,
          faltas: l.faltas,
          vale_transporte: l.vale_transporte,
          mensalidade_sindical: l.mensalidade_sindical,
          gorjeta: l.gorjeta,
          cargo_confianca: l.cargo_confianca,
          insalubridade_20: l.insalubridade_20,
          quebra_caixa_15: l.quebra_caixa_15,
          salario: l.salario,
          comentario: l.comentario || null,
        })),
      )
      if (erroItens) return NextResponse.json({ error: erroItens.message }, { status: 400 })

      aprovadas.push({ empresa: doGrupo[0].empresa ?? 'Sem empresa', colaboradores: doGrupo.length })
    }

    return NextResponse.json({ ok: true, aprovadas, removidas })
  } catch (err) {
    console.error('[fechamento POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

function totalizar(linhas: LinhaFechamento[]) {
  const dinheiro = (n: number) => Math.round(n * 100) / 100
  return {
    colaboradores: linhas.length,
    total_dias: linhas.reduce((s, l) => s + l.dias_trabalhados, 0),
    total_faltas: linhas.reduce((s, l) => s + l.faltas, 0),
    total_gorjeta: dinheiro(linhas.reduce((s, l) => s + l.gorjeta, 0)),
    // Intermitente costuma ter valor/HORA na ficha; somar com mensal daria
    // total falso, então a folha só soma o que é claramente salário mensal.
    total_salario: dinheiro(
      linhas.map(l => paraNumero(l.salario)).filter(v => v >= 100).reduce((s, v) => s + v, 0),
    ),
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
      await ecoarNoRetrato(supabase, competencia, candidateId, null)
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

    await ecoarNoRetrato(supabase, competencia, candidateId, comentario.trim())
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[fechamento comentario PUT]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/**
 * O comentário também vive no retrato da folha aprovada. Sem isto, editar em
 * Folhas aprovadas mudaria a tela e não o documento exportado dali.
 */
async function ecoarNoRetrato(
  supabase: Awaited<ReturnType<typeof createSupabaseServiceClient>>,
  competencia: string,
  candidateId: string,
  comentario: string | null,
) {
  const { data: ciclos } = await supabase
    .from('fechamento_ciclos').select('id').eq('competencia', competencia)
  const ids = (ciclos ?? []).map(c => c.id as string)
  if (ids.length === 0) return
  await supabase.from('fechamento_itens')
    .update({ comentario }).in('ciclo_id', ids).eq('candidate_id', candidateId)
}
