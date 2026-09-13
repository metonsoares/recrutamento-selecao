import { requirePermission } from '@/lib/auth-guard'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { agruparAumentos, salarioVigente } from '@/lib/salario-vigente'
import { dataPura } from '@/lib/helpers'
import { nascimentosPorApp } from '@/lib/nascimento'
import { RelatoriosRh, ColaboradorRelatorio, EmpresaOpcao, FeriasRegistro, AdvertenciaRegistro } from './relatorios-rh'

export default async function RelatoriosPage() {
  await requirePermission('relatorios.ver')
  // ── Relatórios de RH (salários, experiência, aniversariantes) ──────────────
  // Consultas simples e cruzamento em memória — embeds !inner do PostgREST já
  // falharam silenciosamente neste projeto.
  const service = await createSupabaseServiceClient()

  const [{ data: appsRh }, { data: empresasRh }] = await Promise.all([
    service.from('applications')
      .select('id, candidate_id, admission_form, status')
      .in('status', ['contratado', 'em_contrato', 'aprovado'])
      .eq('is_latest', true),
    service.from('companies').select('id, apelido, razao_social'),
  ])

  const appsRhList = appsRh ?? []
  const rhCandIds = appsRhList.map(a => a.candidate_id as string).filter(Boolean)
  const rhAppIds = appsRhList.map(a => a.id as string)

  const { data: rhCands } = rhCandIds.length
    ? await service.from('candidates').select('id, full_name, cpf, deleted_at').in('id', rhCandIds)
    : { data: [] as { id: string; full_name: string; cpf: string | null; deleted_at: string | null }[] }

  // Nascimento: mesma leitura do quadro do mês no Dashboard.
  const nascimentoPorApp = await nascimentosPorApp(service, rhAppIds)

  const rhCandPorId = new Map((rhCands ?? []).map(c => [c.id as string, c]))

  // O relatório mostra quanto a pessoa ganha HOJE: a ficha tem o salário da
  // admissão e os aumentos vivem em salary_raises.
  const { data: aumentosRh } = rhCandIds.length
    ? await service.from('salary_raises')
        .select('candidate_id, raise_date, new_value').in('candidate_id', rhCandIds)
    : { data: [] as { candidate_id: string; raise_date: string; new_value: number }[] }
  const aumentosPorCand = agruparAumentos(aumentosRh)
  const hoje = dataPura(new Date())
  const rhEmpresaPorId = new Map(
    (empresasRh ?? []).map(e => [e.id as string, (e.apelido as string) || (e.razao_social as string) || '—']),
  )

  const colaboradores: ColaboradorRelatorio[] = appsRhList
    .map(a => {
      const c = rhCandPorId.get(a.candidate_id as string)
      if (!c || c.deleted_at) return null
      const af = a.admission_form as Record<string, unknown> | null
      const empresaId = String(af?.selected_company_id ?? '')
      return {
        candidate_id: a.candidate_id as string,
        nome: c.full_name,
        cargo: String(af?.function_title ?? '').trim() || null,
        empresa_id: empresaId || null,
        empresa: rhEmpresaPorId.get(empresaId) ?? null,
        salario: salarioVigente(
          String(af?.salary ?? '').trim() || null,
          aumentosPorCand.get(a.candidate_id as string),
          hoje,
        ),
        admissao: String(af?.admission_date ?? '').trim() || null,
        contrato_experiencia: String(af?.trial_contract ?? '').trim() || null,
        nascimento: nascimentoPorApp.get(a.id as string) ?? null,
        vinculo: a.status === 'aprovado' ? ('intermitente' as const) : ('contratado' as const),
      }
    })
    .filter(Boolean) as ColaboradorRelatorio[]

  colaboradores.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  // Férias já gozadas ('historico') e agendadas ('solicitacao') dos ativos.
  // Consulta simples + cruzamento em memória: embeds !inner do PostgREST já
  // falharam silenciosamente neste projeto.
  const idsColab = colaboradores.map(c => c.candidate_id)
  const { data: feriasData } = idsColab.length
    ? await service.from('vacations')
        .select('candidate_id, start_date, end_date, kind')
        .in('candidate_id', idsColab)
        .order('start_date')
    : { data: [] as { candidate_id: string; start_date: string; end_date: string; kind: string }[] }

  const ferias: FeriasRegistro[] = (feriasData ?? []).map(f => ({
    candidate_id: f.candidate_id as string,
    inicio: f.start_date as string,
    fim: f.end_date as string,
    tipo: (f.kind as string) === 'solicitacao' ? 'solicitacao' : 'historico',
  }))

  // Advertências dos ativos, da mais recente para a mais antiga.
  const { data: advData } = idsColab.length
    ? await service.from('warnings')
        .select('id, candidate_id, occurred_at, reason, file_url, file_path, file_name')
        .in('candidate_id', idsColab)
        .order('occurred_at', { ascending: false })
    : { data: [] as Record<string, unknown>[] }

  const advertencias: AdvertenciaRegistro[] = (advData ?? []).map(a => ({
    id: a.id as string,
    candidate_id: a.candidate_id as string,
    data: (a.occurred_at as string) ?? null,
    motivo: (a.reason as string) ?? '',
    file_url: (a.file_url as string) ?? null,
    file_path: (a.file_path as string) ?? null,
    file_name: (a.file_name as string) ?? null,
  }))

  const empresasOpcoes: EmpresaOpcao[] = Array.from(
    new Map(colaboradores.filter(c => c.empresa_id).map(c => [c.empresa_id as string, c.empresa ?? '—'])).entries(),
  ).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-full overflow-x-hidden">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Relatórios</h1>
        <p className="text-muted-foreground text-sm mt-1">Quadro de pessoal: salários, contratos, aniversários, férias e advertências</p>
      </div>

      {/* Relatórios de RH */}
      <RelatoriosRh colaboradores={colaboradores} empresas={empresasOpcoes} ferias={ferias} advertencias={advertencias} />
    </div>
  )
}
