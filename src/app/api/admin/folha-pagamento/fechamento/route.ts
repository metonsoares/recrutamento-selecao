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
 *
 * Aprovação não se sobrescreve: ninguém pode constar duas vezes na folha do
 * mês. Para refazer, exclui-se a folha da empresa (DELETE) e aprova de novo.
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
    const escopoEmpresa = body.escopo_empresa ? String(body.escopo_empresa) : null
    if (escolhidos.size === 0) {
      return NextResponse.json({ error: 'Marque ao menos um colaborador.' }, { status: 400 })
    }

    const supabase = await createSupabaseServiceClient()
    const auth = await createSupabaseServerClient()
    const { data: { user } } = await auth.auth.getUser()

    const { linhas } = await montarFechamento(competencia)

    // Com filtro de empresa, aprova SÓ aquela; sem filtro, todas as empresas
    // do mês.
    const escopo: (string | null)[] = escopoEmpresa
      ? [escopoEmpresa]
      : Array.from(new Set(linhas.map(l => l.empresa_id ?? null)))

    // O que já está aprovado no mês. Ninguém pode constar duas vezes na folha:
    // nem a mesma empresa aprovada duas vezes, nem o mesmo colaborador
    // aparecendo na folha de duas empresas.
    const { data: jaAprovados } = await supabase
      .from('fechamento_ciclos').select('id, empresa_id, empresa_nome').eq('competencia', competencia)
    const cicloPorEmpresa = new Map<string | null, { id: string; empresa_nome: string | null }>(
      (jaAprovados ?? []).map(c => [
        (c.empresa_id as string | null) ?? null,
        { id: c.id as string, empresa_nome: (c.empresa_nome as string | null) ?? null },
      ]),
    )

    const { data: itensExistentes } = (jaAprovados ?? []).length
      ? await supabase.from('fechamento_itens')
          .select('candidate_id, nome, ciclo_id')
          .in('ciclo_id', (jaAprovados ?? []).map(c => c.id as string))
      : { data: [] as { candidate_id: string; nome: string; ciclo_id: string }[] }
    const jaNaFolha = new Set((itensExistentes ?? []).map(i => i.candidate_id as string))

    const aprovadas: { empresa: string; colaboradores: number }[] = []
    const ignoradas: string[] = []

    for (const empresaId of escopo) {
      const doGrupo = linhas.filter(
        l => (l.empresa_id ?? null) === empresaId && escolhidos.has(l.candidate_id),
      )
      if (doGrupo.length === 0) continue

      const jaTem = cicloPorEmpresa.get(empresaId)
      if (jaTem) {
        const nome = jaTem.empresa_nome ?? 'Sem empresa'
        // Pedido explícito daquela empresa merece erro; num "todas as
        // empresas" o certo é seguir com as que faltam e dizer o que ficou.
        if (escopoEmpresa) {
          return NextResponse.json({
            error: nome + ' já tem folha aprovada nesta competência. '
              + 'Exclua a folha em "Folhas aprovadas" para aprovar de novo.',
          }, { status: 409 })
        }
        ignoradas.push(nome)
        continue
      }

      // O mesmo nome não pode estar também na folha de outra empresa do mês.
      const repetidos = doGrupo.filter(l => jaNaFolha.has(l.candidate_id)).map(l => l.nome)
      if (repetidos.length > 0) {
        return NextResponse.json({
          error: repetidos.slice(0, 3).join(', ')
            + (repetidos.length > 3 ? ' e mais ' + (repetidos.length - 3) : '')
            + ' já consta em uma folha aprovada desta competência. '
            + 'Exclua aquela folha antes de aprovar esta.',
        }, { status: 409 })
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

      const { data: criado, error: erroCiclo } = await supabase
        .from('fechamento_ciclos').insert(registro).select('id').single()
      if (erroCiclo) return NextResponse.json({ error: erroCiclo.message }, { status: 400 })
      const cicloId = criado.id as string

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
          // Lançamentos do mês: o retrato precisa guardá-los, senão a folha
          // aprovada mostraria menos do que a tela onde ela foi aprovada.
          domingos: l.domingos,
          feriados: l.feriados,
          avarias: l.avarias,
          adiantamento: l.adiantamento,
          horas_normais: l.horas_normais,
          horas_50: l.horas_50,
          horas_100: l.horas_100,
          adicional_noturno: l.adicional_noturno,
          gratificacao: l.gratificacao,
          confianca_valor: l.confianca_valor,
          quebra_valor: l.quebra_valor,
        })),
      )
      if (erroItens) return NextResponse.json({ error: erroItens.message }, { status: 400 })

      aprovadas.push({ empresa: doGrupo[0].empresa ?? 'Sem empresa', colaboradores: doGrupo.length })
    }

    return NextResponse.json({ ok: true, aprovadas, ignoradas })
  } catch (err) {
    console.error('[fechamento POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/**
 * DELETE — exclui a folha aprovada de uma empresa no mês. É o único jeito de
 * refazer uma aprovação: os itens saem junto (cascade).
 */
export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireMasterApi()
    if (denied) return denied

    const body = await req.json().catch(() => ({}))
    const competencia = String(body.competencia ?? '')
    if (!/^\d{4}-\d{2}-01$/.test(competencia)) {
      return NextResponse.json({ error: 'Competência inválida.' }, { status: 400 })
    }
    const empresaId = body.empresa_id ? String(body.empresa_id) : null

    const supabase = await createSupabaseServiceClient()
    const filtro = supabase.from('fechamento_ciclos')
      .select('id, empresa_nome').eq('competencia', competencia)
    const { data: ciclo } = await (empresaId
      ? filtro.eq('empresa_id', empresaId)
      : filtro.is('empresa_id', null)).maybeSingle()
    if (!ciclo) return NextResponse.json({ error: 'Folha nao encontrada.' }, { status: 404 })

    const { error } = await supabase.from('fechamento_ciclos').delete().eq('id', ciclo.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true, empresa: (ciclo.empresa_nome as string) ?? 'Sem empresa' })
  } catch (err) {
    console.error('[fechamento DELETE]', err)
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
