import { requireAnyRole } from '@/lib/auth-guard'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { fichaDaCompetencia } from '@/lib/ficha-competencia'
import { FaltasClient, LinhaFalta, EmpresaOpcao } from './faltas-client'

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

export default async function FaltasPage({
  searchParams,
}: {
  searchParams: Promise<{ competencia?: string }>
}) {
  await requireAnyRole(['master', 'gestor_rh'])
  const sp = await searchParams

  const competencia = /^\d{4}-\d{2}-01$/.test(sp.competencia ?? '')
    ? (sp.competencia as string)
    : mesCorrente()
  const fim = fimDoMes(competencia)

  const supabase = await createSupabaseServiceClient()

  // Consultas simples e cruzamento em memória (embeds !inner do PostgREST já
  // falharam silenciosamente neste projeto).
  const [{ data: apps }, { data: empresas }, { data: faltas }] = await Promise.all([
    supabase.from('applications')
      .select('candidate_id, admission_form, admission_form_history, status')
      .in('status', ['contratado', 'em_contrato', 'aprovado'])
      .eq('is_latest', true),
    supabase.from('companies').select('id, apelido, razao_social'),
    supabase.from('absences')
      .select('candidate_id, absence_date, days, kind, comment')
      .gte('absence_date', competencia).lte('absence_date', fim)
      .order('absence_date'),
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

  // Faltas do mês agrupadas por colaborador.
  const porCandidato = new Map<string, { dias: number; registros: number; datas: string[]; kinds: Set<string> }>()
  for (const f of faltas ?? []) {
    const id = f.candidate_id as string
    const atual = porCandidato.get(id) ?? { dias: 0, registros: 0, datas: [], kinds: new Set<string>() }
    atual.dias += Number(f.days) || 1
    atual.registros += 1
    atual.datas.push(f.absence_date as string)
    atual.kinds.add((f.kind as string) || 'injustificada')
    porCandidato.set(id, atual)
  }

  const linhas: LinhaFalta[] = appsList
    .map(a => {
      const c = candPorId.get(a.candidate_id as string)
      if (!c || c.deleted_at) return null
      // A ficha do MÊS, não a de hoje: quem foi transferido de empresa tem
      // ficha nova (empresa nova, admissão nova) e sumiria dos meses anteriores.
      const af = fichaDaCompetencia(a, fim)
      const empresaId = String(af?.selected_company_id ?? '')
      const id = a.candidate_id as string
      const reg = porCandidato.get(id)

      return {
        candidate_id: id,
        nome: c.full_name,
        cpf: String(c.cpf ?? '').replace(/\D/g, '') || null,
        cargo: String(af?.function_title ?? '').trim() || null,
        empresa_id: empresaId || null,
        empresa: empresaPorId.get(empresaId) ?? null,
        vinculo: a.status === 'aprovado' ? ('intermitente' as const) : ('contratado' as const),
        dias: reg?.dias ?? 0,
        registros: reg?.registros ?? 0,
        datas: reg?.datas ?? [],
        tipos: reg ? Array.from(reg.kinds) : [],
      }
    })
    .filter(Boolean) as LinhaFalta[]

  linhas.sort((a, b) => b.dias - a.dias || a.nome.localeCompare(b.nome, 'pt-BR'))

  const empresasOpcoes: EmpresaOpcao[] = Array.from(
    new Map(linhas.filter(l => l.empresa_id).map(l => [l.empresa_id as string, l.empresa ?? '—'])).entries(),
  ).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  return <FaltasClient competencia={competencia} linhas={linhas} empresas={empresasOpcoes} />
}
