import { requireMaster } from '@/lib/auth-guard'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { ValeTransporteClient, LinhaVT, EmpresaOpcao, RegistroDias } from './vale-transporte-client'

export const dynamic = 'force-dynamic'

/** Mês corrente (yyyy-mm-01) no fuso de São Paulo. */
function mesCorrente(): string {
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-01`
}

// Exclusivo do Master. Quem recebe vale transporte vem da FICHA do colaborador
// (admission_form.transport_benefit). Vale para contratados e intermitentes
// ("Intermitentes" é o status `aprovado` no app).
export default async function ValeTransportePage({
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
    supabase
      .from('applications')
      .select('candidate_id, admission_form, status')
      .in('status', ['contratado', 'em_contrato', 'aprovado'])
      .eq('is_latest', true),
    supabase.from('companies').select('id, apelido, razao_social'),
    supabase.from('vt_ciclos').select('*').eq('competencia', competencia).maybeSingle(),
  ])

  const appsList = apps ?? []
  const candIds = appsList.map(a => a.candidate_id as string).filter(Boolean)

  // Consultas simples e cruzamento em memória (embeds !inner do PostgREST
  // já falharam silenciosamente neste projeto).
  const { data: cands } = candIds.length
    ? await supabase.from('candidates').select('id, full_name, cpf, deleted_at').in('id', candIds)
    : { data: [] as { id: string; full_name: string; cpf: string | null; deleted_at: string | null }[] }

  // Dias já registrados, por mês (histórico embaixo de cada nome).
  const [{ data: todosCiclos }, { data: todosItens }] = await Promise.all([
    supabase.from('vt_ciclos').select('id, competencia'),
    supabase.from('vt_itens').select('ciclo_id, candidate_id, dias'),
  ])
  const competenciaPorCiclo = new Map((todosCiclos ?? []).map(c => [c.id as string, c.competencia as string]))

  const historico: RegistroDias[] = (todosItens ?? [])
    .map(h => {
      const comp = competenciaPorCiclo.get(h.ciclo_id as string)
      if (!comp) return null
      return { candidate_id: h.candidate_id as string, competencia: comp, dias: Number(h.dias) }
    })
    .filter(Boolean) as RegistroDias[]

  const candPorId = new Map((cands ?? []).map(c => [c.id as string, c]))
  const empresaPorId = new Map(
    (empresas ?? []).map(e => [e.id as string, (e.apelido as string) || (e.razao_social as string) || '—']),
  )

  const linhas: LinhaVT[] = appsList
    .map(a => {
      const c = candPorId.get(a.candidate_id as string)
      if (!c || c.deleted_at) return null

      const af = a.admission_form as Record<string, unknown> | null
      const empresaId = String(af?.selected_company_id ?? '')
      const bruto = af?.transport_benefit

      // null/undefined = ninguém respondeu ainda na ficha
      const recebe = bruto === true || bruto === 'true' ? true
        : bruto === false || bruto === 'false' ? false
        : null

      return {
        candidate_id: a.candidate_id as string,
        nome: c.full_name,
        cpf: String(c.cpf ?? '').replace(/\D/g, '') || null,
        cargo: String(af?.function_title ?? '').trim() || null,
        empresa_id: empresaId || null,
        empresa: empresaPorId.get(empresaId) ?? null,
        vinculo: a.status === 'aprovado' ? ('intermitente' as const) : ('contratado' as const),
        recebe,
        empresa_transporte: String(af?.transport_company ?? '').trim() || null,
        passagens: String(af?.transport_count ?? '').trim() || null,
      }
    })
    .filter(Boolean) as LinhaVT[]

  linhas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  const empresasOpcoes: EmpresaOpcao[] = Array.from(
    new Map(linhas.filter(l => l.empresa_id).map(l => [l.empresa_id as string, l.empresa ?? '—'])).entries(),
  ).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  return (
    <ValeTransporteClient
      competencia={competencia}
      linhas={linhas}
      empresas={empresasOpcoes}
      historico={historico}
      cicloAprovado={ciclo ? {
        total_dias: Number(ciclo.total_dias),
        aprovado_por: (ciclo.aprovado_por as string) ?? null,
      } : null}
    />
  )
}
