import { requireMaster } from '@/lib/auth-guard'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { GorjetasClient, LinhaGorjeta, EmpresaOpcao, PagamentoGorjeta } from './gorjetas-client'

export const dynamic = 'force-dynamic'

/** Mês corrente (yyyy-mm-01) no fuso de São Paulo. */
function mesCorrente(): string {
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-01`
}

export default async function GorjetasPage({
  searchParams,
}: {
  searchParams: Promise<{ competencia?: string }>
}) {
  await requireMaster()
  const sp = await searchParams

  const competencia = /^\d{4}-\d{2}-01$/.test(sp.competencia ?? '')
    ? (sp.competencia as string)
    : mesCorrente()

  const supabase = await createSupabaseServiceClient()

  const [{ data: apps }, { data: empresas }, { data: ciclo }] = await Promise.all([
    // Só CONTRATADO recebe gorjeta: quem está "em contrato" (experiência) e o
    // intermitente ficam de fora — regra do dono, e é o que a prática já diz
    // (nenhum lançamento de gorjeta existente é de outro vínculo).
    supabase.from('applications')
      .select('candidate_id, admission_form, status')
      .eq('status', 'contratado')
      .eq('is_latest', true),
    supabase.from('companies').select('id, apelido, razao_social').order('apelido'),
    supabase.from('gorjeta_ciclos').select('*').eq('competencia', competencia).maybeSingle(),
  ])

  const appsList = apps ?? []
  const candIds = appsList.map(a => a.candidate_id as string).filter(Boolean)

  const { data: cands } = candIds.length
    ? await supabase.from('candidates').select('id, full_name, cpf, deleted_at').in('id', candIds)
    : { data: [] as { id: string; full_name: string; cpf: string | null; deleted_at: string | null }[] }

  // Peso por colaborador (vem da função, não muda a cada mês) e os DIAS
  // TRABALHADOS do mês, reaproveitados do registro do Vale transporte para o
  // dono não precisar digitar a mesma informação duas vezes.
  const [{ data: pesosData }, { data: cicloVt }] = await Promise.all([
    supabase.from('gorjeta_pesos').select('candidate_id, peso'),
    supabase.from('vt_ciclos').select('id').eq('competencia', competencia).maybeSingle(),
  ])
  const { data: diasVt } = cicloVt?.id
    ? await supabase.from('vt_itens').select('candidate_id, dias').eq('ciclo_id', cicloVt.id)
    : { data: [] as { candidate_id: string; dias: number }[] }

  const pesos: Record<string, number> = {}
  for (const p of pesosData ?? []) pesos[p.candidate_id as string] = Number(p.peso)
  const diasTrabalhados: Record<string, number> = {}
  for (const d of diasVt ?? []) diasTrabalhados[d.candidate_id as string] = Number(d.dias)

  // Histórico: consultas simples e cruzamento em memória (embeds !inner do
  // PostgREST já falharam silenciosamente neste projeto).
  const [{ data: todosCiclos }, { data: todosItens }] = await Promise.all([
    supabase.from('gorjeta_ciclos').select('id, competencia'),
    supabase.from('gorjeta_itens').select('ciclo_id, candidate_id, valor'),
  ])
  const competenciaPorCiclo = new Map((todosCiclos ?? []).map(c => [c.id as string, c.competencia as string]))

  const historico: PagamentoGorjeta[] = (todosItens ?? [])
    .map(h => {
      const comp = competenciaPorCiclo.get(h.ciclo_id as string)
      if (!comp) return null
      return { candidate_id: h.candidate_id as string, competencia: comp, valor: Number(h.valor) }
    })
    .filter(Boolean) as PagamentoGorjeta[]

  const candPorId = new Map((cands ?? []).map(c => [c.id as string, c]))
  const empresaPorId = new Map(
    (empresas ?? []).map(e => [e.id as string, (e.apelido as string) || (e.razao_social as string) || '—']),
  )

  // Só entra quem tem "Gorjeta = Sim" na ficha do funcionário.
  const linhas: LinhaGorjeta[] = appsList
    .map(a => {
      const c = candPorId.get(a.candidate_id as string)
      if (!c || c.deleted_at) return null
      const af = a.admission_form as Record<string, unknown> | null
      const bruto = af?.gorjeta
      if (!(bruto === true || bruto === 'true')) return null

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
    .filter(Boolean) as LinhaGorjeta[]

  linhas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  const empresasOpcoes: EmpresaOpcao[] = Array.from(
    new Map(linhas.filter(l => l.empresa_id).map(l => [l.empresa_id as string, l.empresa ?? '—'])).entries(),
  ).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  return (
    <GorjetasClient
      competencia={competencia}
      linhas={linhas}
      empresas={empresasOpcoes}
      historico={historico}
      pesos={pesos}
      diasTrabalhados={diasTrabalhados}
      cicloAprovado={ciclo ? {
        total: Number(ciclo.total),
        aprovado_por: (ciclo.aprovado_por as string) ?? null,
      } : null}
    />
  )
}
