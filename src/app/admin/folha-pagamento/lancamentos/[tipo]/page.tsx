import { notFound } from 'next/navigation'
import { requireMaster } from '@/lib/auth-guard'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { mesCorrente, fimDoMes, competenciaValida } from '@/lib/competencia'
import { LANCAMENTOS, tipoValido } from '@/lib/folha-lancamentos'
import { LancamentosClient, LinhaLancamento, EmpresaOpcao, RegistroLancamento } from './lancamentos-client'

export const dynamic = 'force-dynamic'

/**
 * Uma página para os sete lançamentos de folha. O tipo vem da URL e diz o que
 * muda: rótulo, unidade lançada e quem entra na lista.
 */
export default async function LancamentosPage({
  params, searchParams,
}: {
  params: Promise<{ tipo: string }>
  searchParams: Promise<{ competencia?: string }>
}) {
  await requireMaster()
  const { tipo } = await params
  if (!tipoValido(tipo)) notFound()

  const config = LANCAMENTOS[tipo]
  const sp = await searchParams
  const competencia = competenciaValida(sp.competencia) ? sp.competencia : mesCorrente()
  const fim = fimDoMes(competencia)

  const supabase = await createSupabaseServiceClient()

  // Consultas simples e cruzamento em memória: embeds !inner do PostgREST já
  // falharam silenciosamente neste projeto.
  const [{ data: apps }, { data: empresas }, { data: ciclos }] = await Promise.all([
    supabase.from('applications')
      .select('candidate_id, admission_form, status')
      .in('status', ['contratado', 'em_contrato', 'aprovado'])
      .eq('is_latest', true),
    supabase.from('companies').select('id, apelido, razao_social'),
    supabase.from('folha_ciclos').select('id, competencia, aprovado_por, total_valor, total_qtd').eq('tipo', tipo),
  ])

  const cicloIds = (ciclos ?? []).map(c => c.id as string)
  const { data: itens } = cicloIds.length
    ? await supabase.from('folha_itens')
        .select('ciclo_id, candidate_id, quantidade, valor').in('ciclo_id', cicloIds)
    : { data: [] as { ciclo_id: string; candidate_id: string; quantidade: number; valor: number }[] }

  const competenciaPorCiclo = new Map((ciclos ?? []).map(c => [c.id as string, c.competencia as string]))
  const historico: RegistroLancamento[] = (itens ?? [])
    .map(i => {
      const comp = competenciaPorCiclo.get(i.ciclo_id as string)
      if (!comp) return null
      return {
        candidate_id: i.candidate_id as string,
        competencia: comp,
        quantidade: Number(i.quantidade) || 0,
        valor: Number(i.valor) || 0,
      }
    })
    .filter(Boolean) as RegistroLancamento[]

  const cicloDoMes = (ciclos ?? []).find(c => c.competencia === competencia) ?? null

  const appsList = apps ?? []
  const candIds = appsList.map(a => a.candidate_id as string).filter(Boolean)
  const { data: cands } = candIds.length
    ? await supabase.from('candidates').select('id, full_name, cpf, deleted_at').in('id', candIds)
    : { data: [] as { id: string; full_name: string; cpf: string | null; deleted_at: string | null }[] }

  const candPorId = new Map((cands ?? []).map(c => [c.id as string, c]))
  const empresaPorId = new Map(
    (empresas ?? []).map(e => [e.id as string, (e.apelido as string) || (e.razao_social as string) || '—']),
  )

  const linhas: LinhaLancamento[] = appsList
    .map(a => {
      const c = candPorId.get(a.candidate_id as string)
      if (!c || c.deleted_at) return null

      const af = a.admission_form as Record<string, unknown> | null

      // Admitido DEPOIS do mês não entra na folha daquele período.
      const admissao = String(af?.admission_date ?? '').trim() || null
      if (admissao && /^\d{4}-\d{2}-\d{2}$/.test(admissao) && admissao > fim) return null

      // Tipos ligados a uma resposta da ficha listam só quem tem "Sim" —
      // mesma regra que Gorjetas já usa.
      if (config.campoFicha) {
        const v = af?.[config.campoFicha]
        if (!(v === true || v === 'true')) return null
      }

      const empresaId = String(af?.selected_company_id ?? '')
      return {
        candidate_id: a.candidate_id as string,
        nome: c.full_name,
        cpf: String(c.cpf ?? '').replace(/\D/g, '') || null,
        cargo: String(af?.function_title ?? '').trim() || null,
        empresa_id: empresaId || null,
        empresa: empresaPorId.get(empresaId) ?? null,
        vinculo: a.status === 'aprovado' ? ('intermitente' as const) : ('contratado' as const),
      }
    })
    .filter(Boolean) as LinhaLancamento[]

  linhas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  const empresasOpcoes: EmpresaOpcao[] = Array.from(
    new Map(linhas.filter(l => l.empresa_id).map(l => [l.empresa_id as string, l.empresa ?? '—'])).entries(),
  ).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  return (
    <LancamentosClient
      config={config}
      competencia={competencia}
      linhas={linhas}
      empresas={empresasOpcoes}
      historico={historico}
      cicloAprovado={cicloDoMes ? {
        total_valor: Number(cicloDoMes.total_valor),
        total_qtd: Number(cicloDoMes.total_qtd),
        aprovado_por: (cicloDoMes.aprovado_por as string) ?? null,
      } : null}
    />
  )
}
