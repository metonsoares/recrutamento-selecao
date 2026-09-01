import { requirePermission } from '@/lib/auth-guard'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { RelatoriosRh, ColaboradorRelatorio, EmpresaOpcao, FeriasRegistro, AdvertenciaRegistro } from './relatorios-rh'

/** Respostas do formulário são gravadas como JSON.stringify(valor). */
function parseTexto(v: string | null): string | null {
  if (!v) return null
  try {
    const p = JSON.parse(v)
    return typeof p === 'string' ? p : null
  } catch { return v }
}

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

  const [{ data: rhCands }, { data: perguntasData }] = await Promise.all([
    rhCandIds.length
      ? service.from('candidates').select('id, full_name, cpf, deleted_at').in('id', rhCandIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string; cpf: string | null; deleted_at: string | null }[] }),
    service.from('form_questions').select('id').eq('field_type', 'date'),
  ])

  // Data de nascimento: primeira resposta de pergunta do tipo data.
  const perguntasData_ids = (perguntasData ?? []).map(q => q.id as string)
  const { data: respostasData } = perguntasData_ids.length && rhAppIds.length
    ? await service.from('form_answers')
        .select('application_id, answer_text')
        .in('question_id', perguntasData_ids)
        .in('application_id', rhAppIds)
    : { data: [] as { application_id: string; answer_text: string | null }[] }

  const nascimentoPorApp = new Map<string, string>()
  for (const r of respostasData ?? []) {
    const d = parseTexto(r.answer_text as string | null)
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !nascimentoPorApp.has(r.application_id as string)) {
      nascimentoPorApp.set(r.application_id as string, d)
    }
  }

  const rhCandPorId = new Map((rhCands ?? []).map(c => [c.id as string, c]))
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
        salario: String(af?.salary ?? '').trim() || null,
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
