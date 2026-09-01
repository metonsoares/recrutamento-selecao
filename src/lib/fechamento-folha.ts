import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { fimDoMes } from '@/lib/competencia'

/**
 * Montagem do fechamento de folha de um mês.
 *
 * Vive aqui porque DUAS telas mostram exatamente a mesma tabela: o Fechamento
 * de folha (onde se confere e aprova) e as Folhas aprovadas (onde se consulta
 * o que já foi fechado). Duplicar a consolidação garantiria que um dia as duas
 * mostrariam números diferentes para o mesmo mês.
 */

export interface LinhaFechamento {
  candidate_id: string
  nome: string
  cpf: string | null
  cargo: string | null
  empresa_id: string | null
  empresa: string | null
  vinculo: 'contratado' | 'intermitente'
  dias_trabalhados: number
  faltas: number
  /** null = a ficha ainda não respondeu */
  vale_transporte: boolean | null
  mensalidade_sindical: boolean | null
  gorjeta: number
  cargo_confianca: boolean | null
  insalubridade_20: boolean | null
  quebra_caixa_15: boolean | null
  /** como veio da ficha: "R$ 1.892,34" */
  salario: string | null
  comentario: string

  // ── Lançamentos aprovados do mês (0 = não houve) ──
  domingos: number
  feriados: number
  avarias: number
  adiantamento: number
  horas_normais: number
  horas_50: number
  horas_100: number
  adicional_noturno: number
  gratificacao: number
  /** valor do adicional de cargo de confiança lançado no mês */
  confianca_valor: number
  /** valor da quebra de caixa lançada no mês (já com o desconto) */
  quebra_valor: number
}

export interface EmpresaOpcao { id: string; nome: string }

/** Só os lançamentos, para somar por colaborador sem repetir onze zeros. */
type Lancamentos = Pick<LinhaFechamento,
  'domingos' | 'feriados' | 'avarias' | 'adiantamento' | 'horas_normais' | 'horas_50'
  | 'horas_100' | 'adicional_noturno' | 'gratificacao' | 'confianca_valor' | 'quebra_valor'>

function lancamentosZerados(): Lancamentos {
  return {
    domingos: 0, feriados: 0, avarias: 0, adiantamento: 0, horas_normais: 0,
    horas_50: 0, horas_100: 0, adicional_noturno: 0, gratificacao: 0,
    confianca_valor: 0, quebra_valor: 0,
  }
}

/** Sim/Não da ficha: null quando ninguém respondeu ainda. */
function simNao(v: unknown): boolean | null {
  if (v === true || v === 'true') return true
  if (v === false || v === 'false') return false
  return null
}

export async function montarFechamento(competencia: string): Promise<{
  linhas: LinhaFechamento[]
  empresas: EmpresaOpcao[]
  temFechamentoVt: boolean
  temFechamentoGorjeta: boolean
}> {
  const fim = fimDoMes(competencia)
  const supabase = await createSupabaseServiceClient()

  // Consultas simples e cruzamento em memória: embeds !inner do PostgREST já
  // falharam silenciosamente neste projeto.
  const [
    { data: apps }, { data: empresas }, { data: vtCiclo }, { data: gorjetaCiclo },
    { data: faltas }, { data: comentarios },
  ] = await Promise.all([
    supabase.from('applications')
      .select('candidate_id, admission_form, status')
      .in('status', ['contratado', 'em_contrato', 'aprovado'])
      .eq('is_latest', true),
    supabase.from('companies').select('id, apelido, razao_social'),
    supabase.from('vt_ciclos').select('id').eq('competencia', competencia).maybeSingle(),
    supabase.from('gorjeta_ciclos').select('id').eq('competencia', competencia).maybeSingle(),
    supabase.from('absences')
      .select('candidate_id, days')
      .gte('absence_date', competencia).lte('absence_date', fim),
    supabase.from('fechamento_comentarios')
      .select('candidate_id, comentario').eq('competencia', competencia),
  ])

  // Lançamentos do mês (avarias, horas extras, gratificação…): o fechamento
  // consolida o que já foi aprovado em cada tela, não pede para digitar de novo.
  const { data: ciclosLanc } = await supabase
    .from('folha_ciclos').select('id, tipo').eq('competencia', competencia)
  const idsLanc = (ciclosLanc ?? []).map(c => c.id as string)
  const tipoPorCiclo = new Map((ciclosLanc ?? []).map(c => [c.id as string, c.tipo as string]))

  const { data: itensLanc } = idsLanc.length
    ? await supabase.from('folha_itens')
        .select('ciclo_id, candidate_id, quantidade, quantidade2, quantidade3, quantidade4, valor')
        .in('ciclo_id', idsLanc)
    : { data: [] as Record<string, unknown>[] }

  const lancPorCand = new Map<string, Lancamentos>()
  for (const i of itensLanc ?? []) {
    const tipo = tipoPorCiclo.get(i.ciclo_id as string)
    if (!tipo) continue
    const id = i.candidate_id as string
    const atual = lancPorCand.get(id) ?? lancamentosZerados()
    const n = (v: unknown) => Number(v) || 0
    switch (tipo) {
      case 'avarias': atual.avarias += n(i.valor); break
      case 'adiantamento-salarial': atual.adiantamento += n(i.valor); break
      case 'gratificacao': atual.gratificacao += n(i.valor); break
      case 'cargo-confianca': atual.confianca_valor += n(i.valor); break
      case 'quebra-caixa': atual.quebra_valor += n(i.valor); break
      case 'domingos-feriados':
        atual.domingos += n(i.quantidade)
        atual.feriados += n(i.quantidade2)
        break
      case 'horas-extras':
        atual.adicional_noturno += n(i.quantidade)
        atual.horas_50 += n(i.quantidade2)
        atual.horas_100 += n(i.quantidade3)
        atual.horas_normais += n(i.quantidade4)
        break
    }
    lancPorCand.set(id, atual)
  }

  const [{ data: vtItens }, { data: gorjetaItens }] = await Promise.all([
    vtCiclo?.id
      ? supabase.from('vt_itens').select('candidate_id, dias').eq('ciclo_id', vtCiclo.id)
      : Promise.resolve({ data: [] as { candidate_id: string; dias: number }[] }),
    gorjetaCiclo?.id
      ? supabase.from('gorjeta_itens').select('candidate_id, valor').eq('ciclo_id', gorjetaCiclo.id)
      : Promise.resolve({ data: [] as { candidate_id: string; valor: number }[] }),
  ])

  const appsList = apps ?? []
  const candIds = appsList.map(a => a.candidate_id as string).filter(Boolean)
  const { data: cands } = candIds.length
    ? await supabase.from('candidates').select('id, full_name, cpf, deleted_at').in('id', candIds)
    : { data: [] as { id: string; full_name: string; cpf: string | null; deleted_at: string | null }[] }

  const candPorId = new Map((cands ?? []).map(c => [c.id as string, c]))
  const empresaPorId = new Map(
    (empresas ?? []).map(e => [e.id as string, (e.apelido as string) || (e.razao_social as string) || '—']),
  )
  const diasPorCand = new Map((vtItens ?? []).map(i => [i.candidate_id as string, Number(i.dias) || 0]))
  const gorjetaPorCand = new Map((gorjetaItens ?? []).map(i => [i.candidate_id as string, Number(i.valor) || 0]))
  const comentarioPorCand = new Map((comentarios ?? []).map(c => [c.candidate_id as string, c.comentario as string]))

  const faltasPorCand = new Map<string, number>()
  for (const f of faltas ?? []) {
    const id = f.candidate_id as string
    faltasPorCand.set(id, (faltasPorCand.get(id) ?? 0) + (Number(f.days) || 1))
  }

  const linhas: LinhaFechamento[] = appsList
    .map(a => {
      const c = candPorId.get(a.candidate_id as string)
      if (!c || c.deleted_at) return null

      const af = a.admission_form as Record<string, unknown> | null

      // Admitido DEPOIS do mês não entra na folha daquele período.
      const admissao = String(af?.admission_date ?? '').trim() || null
      if (admissao && /^\d{4}-\d{2}-\d{2}$/.test(admissao) && admissao > fim) return null

      const id = a.candidate_id as string
      const empresaId = String(af?.selected_company_id ?? '')

      return {
        candidate_id: id,
        nome: c.full_name,
        cpf: String(c.cpf ?? '').replace(/\D/g, '') || null,
        cargo: String(af?.function_title ?? '').trim() || null,
        empresa_id: empresaId || null,
        empresa: empresaPorId.get(empresaId) ?? null,
        vinculo: a.status === 'aprovado' ? ('intermitente' as const) : ('contratado' as const),
        dias_trabalhados: diasPorCand.get(id) ?? 0,
        faltas: faltasPorCand.get(id) ?? 0,
        vale_transporte: simNao(af?.transport_benefit),
        mensalidade_sindical: simNao(af?.union_dues),
        gorjeta: gorjetaPorCand.get(id) ?? 0,
        cargo_confianca: simNao(af?.cargo_confianca),
        insalubridade_20: simNao(af?.insalubridade_20),
        quebra_caixa_15: simNao(af?.quebra_caixa_15),
        salario: String(af?.salary ?? '').trim() || null,
        comentario: comentarioPorCand.get(id) ?? '',
        ...(lancPorCand.get(id) ?? lancamentosZerados()),
      }
    })
    .filter(Boolean) as LinhaFechamento[]

  linhas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  const empresasOpcoes: EmpresaOpcao[] = Array.from(
    new Map(linhas.filter(l => l.empresa_id).map(l => [l.empresa_id as string, l.empresa ?? '—'])).entries(),
  ).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  return {
    linhas,
    empresas: empresasOpcoes,
    temFechamentoVt: !!vtCiclo?.id,
    temFechamentoGorjeta: !!gorjetaCiclo?.id,
  }
}
