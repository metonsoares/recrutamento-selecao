import { requireMaster } from '@/lib/auth-guard'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { mesCorrente, fimDoMes, competenciaValida } from '@/lib/competencia'
import { FechamentoClient, LinhaFechamento, EmpresaOpcao } from './fechamento-client'

export const dynamic = 'force-dynamic'

/** Sim/Não da ficha: null quando ninguém respondeu ainda. */
function simNao(v: unknown): boolean | null {
  if (v === true || v === 'true') return true
  if (v === false || v === 'false') return false
  return null
}

/**
 * Fechamento de folha — exclusivo do Master.
 *
 * Consolida numa linha só o que hoje está espalhado em cinco telas: dias
 * trabalhados (Vale transporte), faltas, gorjeta aprovada e as respostas da
 * ficha. Nada aqui é digitado de novo — só o comentário.
 */
export default async function FechamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ competencia?: string }>
}) {
  await requireMaster()
  const sp = await searchParams

  const competencia = competenciaValida(sp.competencia) ? sp.competencia : mesCorrente()
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

  const { data: aprovacao } = await supabase
    .from('fechamento_ciclos')
    .select('aprovado_por, aprovado_em').eq('competencia', competencia).maybeSingle()

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
      }
    })
    .filter(Boolean) as LinhaFechamento[]

  linhas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  const empresasOpcoes: EmpresaOpcao[] = Array.from(
    new Map(linhas.filter(l => l.empresa_id).map(l => [l.empresa_id as string, l.empresa ?? '—'])).entries(),
  ).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  return (
    <FechamentoClient
      competencia={competencia}
      linhas={linhas}
      empresas={empresasOpcoes}
      temFechamentoVt={!!vtCiclo?.id}
      temFechamentoGorjeta={!!gorjetaCiclo?.id}
      aprovacao={aprovacao ? {
        aprovado_por: (aprovacao.aprovado_por as string) ?? null,
        aprovado_em: aprovacao.aprovado_em as string,
      } : null}
    />
  )
}
