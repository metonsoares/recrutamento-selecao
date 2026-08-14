import { requireMaster } from '@/lib/auth-guard'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { SindicalClient, LinhaSindical, EmpresaOpcao } from './sindical-client'

export const dynamic = 'force-dynamic'

/** Mês corrente (yyyy-mm-01) no fuso de São Paulo. */
function mesCorrente(): string {
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-01`
}

/** Último dia do mês (yyyy-mm-dd). */
function fimDoMes(competencia: string): string {
  const [ano, mes] = competencia.split('-').map(Number)
  const ultimo = new Date(ano, mes, 0).getDate()
  return `${ano}-${String(mes).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`
}

export default async function MensalidadeSindicalPage({
  searchParams,
}: {
  searchParams: Promise<{ competencia?: string }>
}) {
  await requireMaster()
  const sp = await searchParams

  const competencia = /^\d{4}-\d{2}-01$/.test(sp.competencia ?? '')
    ? (sp.competencia as string)
    : mesCorrente()
  const fim = fimDoMes(competencia)

  const supabase = await createSupabaseServiceClient()

  // Consultas simples e cruzamento em memória (embeds !inner do PostgREST já
  // falharam silenciosamente neste projeto).
  const [{ data: apps }, { data: empresas }] = await Promise.all([
    supabase.from('applications')
      .select('candidate_id, admission_form, status')
      .in('status', ['contratado', 'em_contrato', 'aprovado'])
      .eq('is_latest', true),
    supabase.from('companies').select('id, apelido, razao_social'),
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

  const linhas: LinhaSindical[] = appsList
    .map(a => {
      const c = candPorId.get(a.candidate_id as string)
      if (!c || c.deleted_at) return null

      const af = a.admission_form as Record<string, unknown> | null

      // Quem foi admitido DEPOIS do mês não entra na folha daquele período.
      const admissao = String(af?.admission_date ?? '').trim() || null
      if (admissao && /^\d{4}-\d{2}-\d{2}$/.test(admissao) && admissao > fim) return null

      const bruto = af?.union_dues
      const paga = bruto === true || bruto === 'true' ? true
        : bruto === false || bruto === 'false' ? false
        : null // ficha ainda não respondeu

      const empresaId = String(af?.selected_company_id ?? '')
      return {
        candidate_id: a.candidate_id as string,
        nome: c.full_name,
        cpf: String(c.cpf ?? '').replace(/\D/g, '') || null,
        cargo: String(af?.function_title ?? '').trim() || null,
        empresa_id: empresaId || null,
        empresa: empresaPorId.get(empresaId) ?? null,
        vinculo: a.status === 'aprovado' ? ('intermitente' as const) : ('contratado' as const),
        paga,
        admissao,
      }
    })
    .filter(Boolean) as LinhaSindical[]

  linhas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  const empresasOpcoes: EmpresaOpcao[] = Array.from(
    new Map(linhas.filter(l => l.empresa_id).map(l => [l.empresa_id as string, l.empresa ?? '—'])).entries(),
  ).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  return <SindicalClient competencia={competencia} linhas={linhas} empresas={empresasOpcoes} />
}
