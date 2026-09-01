import { notFound } from 'next/navigation'
import { requireAnyRole } from '@/lib/auth-guard'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { mesCorrente, fimDoMes, competenciaValida } from '@/lib/competencia'
import { LANCAMENTOS, tipoValido } from '@/lib/folha-lancamentos'
import { fichaDaCompetencia } from '@/lib/ficha-competencia'
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
  const { tipo } = await params
  if (!tipoValido(tipo)) notFound()

  const config = LANCAMENTOS[tipo]
  // O guard sai da própria configuração do tipo — assim menu, página e rota
  // não têm como divergir.
  await requireAnyRole(config.perfis)
  const sp = await searchParams
  const competencia = competenciaValida(sp.competencia) ? sp.competencia : mesCorrente()
  const fim = fimDoMes(competencia)

  const supabase = await createSupabaseServiceClient()

  // Consultas simples e cruzamento em memória: embeds !inner do PostgREST já
  // falharam silenciosamente neste projeto.
  const [{ data: apps }, { data: empresas }, { data: ciclos }] = await Promise.all([
    supabase.from('applications')
      .select('candidate_id, admission_form, admission_form_history, status')
      .in('status', ['contratado', 'em_contrato', 'aprovado'])
      .eq('is_latest', true),
    supabase.from('companies').select('id, apelido, razao_social'),
    supabase.from('folha_ciclos').select('id, competencia, aprovado_por, total_valor, total_qtd, total_qtd2, total_qtd3, total_qtd4, total_qtd5, total_desconto').eq('tipo', tipo),
  ])

  const cicloIds = (ciclos ?? []).map(c => c.id as string)
  const { data: itens } = cicloIds.length
    ? await supabase.from('folha_itens')
        .select('ciclo_id, candidate_id, quantidade, quantidade2, quantidade3, quantidade4, quantidade5, valor, desconto, observacao').in('ciclo_id', cicloIds)
    : { data: [] as { ciclo_id: string; candidate_id: string; quantidade: number; quantidade2: number; quantidade3: number; quantidade4: number; quantidade5: number; valor: number; desconto: number; observacao: string | null }[] }

  const competenciaPorCiclo = new Map((ciclos ?? []).map(c => [c.id as string, c.competencia as string]))
  const historico: RegistroLancamento[] = (itens ?? [])
    .map(i => {
      const comp = competenciaPorCiclo.get(i.ciclo_id as string)
      if (!comp) return null
      return {
        candidate_id: i.candidate_id as string,
        competencia: comp,
        quantidade: Number(i.quantidade) || 0,
        quantidade2: Number(i.quantidade2) || 0,
        quantidade3: Number(i.quantidade3) || 0,
        quantidade4: Number(i.quantidade4) || 0,
        quantidade5: Number(i.quantidade5) || 0,
        valor: Number(i.valor) || 0,
        desconto: Number(i.desconto) || 0,
        observacao: (i.observacao as string | null) ?? null,
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

      // A ficha do MÊS, não a de hoje: quem foi transferido de empresa tem
      // ficha nova (empresa nova, admissão nova) e sumiria dos meses anteriores.
      const af = fichaDaCompetencia(a, fim)

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
        // Como veio da ficha ("1.892,34"): serve para calcular percentuais.
        salario: String(af?.salary ?? '').trim() || null,
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
        total_qtd2: Number(cicloDoMes.total_qtd2),
        total_qtd3: Number(cicloDoMes.total_qtd3),
        total_qtd4: Number(cicloDoMes.total_qtd4),
        total_qtd5: Number(cicloDoMes.total_qtd5),
        total_desconto: Number(cicloDoMes.total_desconto),
        aprovado_por: (cicloDoMes.aprovado_por as string) ?? null,
      } : null}
    />
  )
}
