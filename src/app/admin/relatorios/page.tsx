import { requirePermission } from '@/lib/auth-guard'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { STATUS_LABELS, CandidateStatus } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RelatoriosRh, ColaboradorRelatorio, EmpresaOpcao, FeriasRegistro } from './relatorios-rh'

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
  const supabase = await createSupabaseServerClient()

  const { data: candidates } = await supabase
    .from('candidates')
    .select('id, created_at')
    .is('deleted_at', null)

  const activeIds = (candidates || []).map(c => c.id)

  const { data: applications } = activeIds.length
    ? await supabase
        .from('applications')
        .select('status, final_score, culture_score, experience_score, created_at, job_id, jobs(title), candidate_id')
        .eq('is_latest', true)
        .in('candidate_id', activeIds)
    : { data: [] }

  const apps = applications || []
  const totalCandidates = candidates?.length || 0

  const byStatus: Record<string, number> = {}
  apps.forEach(a => { byStatus[a.status] = (byStatus[a.status] || 0) + 1 })

  const byJob: Record<string, number> = {}
  apps.forEach(a => {
    const title = (a.jobs as { title?: string } | null)?.title || 'Sem vaga'
    byJob[title] = (byJob[title] || 0) + 1
  })

  const scored = apps.filter(a => a.final_score != null)
  const avgFinal = scored.length ? scored.reduce((sum, a) => sum + (a.final_score || 0), 0) / scored.length : 0
  const avgCulture = scored.length ? scored.reduce((sum, a) => sum + (a.culture_score || 0), 0) / scored.length : 0

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

  const empresasOpcoes: EmpresaOpcao[] = Array.from(
    new Map(colaboradores.filter(c => c.empresa_id).map(c => [c.empresa_id as string, c.empresa ?? '—'])).entries(),
  ).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  const approved = byStatus['aprovado'] || 0
  const reprovado = byStatus['reprovado'] || 0
  const total = approved + reprovado
  const taxaAprovacao = total > 0 ? Math.round((approved / total) * 100) : 0

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-full overflow-x-hidden">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Relatórios</h1>
        <p className="text-muted-foreground text-sm mt-1">Visão analítica do processo seletivo</p>
      </div>

      {/* Relatórios de RH */}
      <RelatoriosRh colaboradores={colaboradores} empresas={empresasOpcoes} ferias={ferias} />

      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl sm:text-3xl font-bold">{totalCandidates}</p>
          <p className="text-xs sm:text-sm text-muted-foreground">Total de Candidatos</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl sm:text-3xl font-bold">{avgFinal.toFixed(1)}</p>
          <p className="text-xs sm:text-sm text-muted-foreground">Média Nota Final</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl sm:text-3xl font-bold">{avgCulture.toFixed(1)}</p>
          <p className="text-xs sm:text-sm text-muted-foreground">Média Nota Cultural</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl sm:text-3xl font-bold">{taxaAprovacao}%</p>
          <p className="text-xs sm:text-sm text-muted-foreground">Taxa de Aprovação</p>
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Candidatos por Status</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between gap-2">
                <Badge variant="outline" className="text-xs shrink-0">{STATUS_LABELS[status as CandidateStatus] || status}</Badge>
                <div className="flex items-center gap-2">
                  <div className="w-20 sm:w-32 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${(count / totalCandidates) * 100}%` }} />
                  </div>
                  <span className="text-sm font-medium w-6 text-right">{count}</span>
                </div>
              </div>
            ))}
            {!Object.keys(byStatus).length && <p className="text-muted-foreground text-sm">Sem dados</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Candidatos por Vaga</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(byJob).sort((a, b) => b[1] - a[1]).map(([job, count]) => (
              <div key={job} className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground truncate flex-1">{job}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-20 sm:w-32 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full" style={{ width: `${(count / apps.length) * 100}%` }} />
                  </div>
                  <span className="text-sm font-medium w-6 text-right">{count}</span>
                </div>
              </div>
            ))}
            {!Object.keys(byJob).length && <p className="text-muted-foreground text-sm">Sem dados</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Resumo por Status</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm min-w-[260px]">
            <thead><tr className="border-b text-muted-foreground text-xs">
              <th className="text-left pb-2">Status</th>
              <th className="text-right pb-2">Qtd</th>
              <th className="text-right pb-2">%</th>
            </tr></thead>
            <tbody>
              {Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
                <tr key={status} className="border-b last:border-0">
                  <td className="py-2">{STATUS_LABELS[status as CandidateStatus] || status}</td>
                  <td className="py-2 text-right font-medium">{count}</td>
                  <td className="py-2 text-right text-muted-foreground">{totalCandidates > 0 ? ((count / totalCandidates) * 100).toFixed(1) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
