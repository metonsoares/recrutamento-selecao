import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { STATUS_LABELS, STATUS_COLORS, CandidateStatus, BackgroundCheckResult } from '@/types'
import { formatDate, formatDateTime } from '@/lib/helpers'
import { CandidateActions } from './candidate-actions'
import { CandidateNotesEditor } from './notes-editor'
import { PhotoViewer, PhotoPlaceholder } from './photo-viewer'
import { DeleteCandidateSection } from './delete-candidate-section'
import { EditVagaButton } from './edit-vaga-button'
import { CandidateTabNav } from './candidate-tab-nav'
import { FichaAdmissaoForm, AdmissionFormData, CandidateAddress, CompanyOption } from './ficha-admissao/ficha-admissao-form'
import { DocumentosTab } from './documentos-tab'
import { AdvertenciasTab } from './advertencias-tab'
import { DadosBancariosTab, BankData } from './dados-bancarios-tab'
import { ResumoColaborador } from './resumo-colaborador'
import { FeriasTab } from './ferias-tab'
import { AtestadosTab } from './atestados-tab'
import { DadosContratoTab, ContractData } from './dados-contrato-tab'
import { FileDown, Globe, ArrowLeft, AlertTriangle, RefreshCw, Clock } from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HIDE_FIELD_TYPES = new Set([
  'date', 'celular', 'email', 'job_select', 'address', 'file_upload', 'cpf', 'cep',
])
const HIDE_QUESTION_PATTERNS = [
  'nome completo', 'endereço', 'bairro', 'cidade', 'telefone',
  'celular', 'e-mail', 'email', 'vaga de interesse', 'anexe',
]

function parseAnswer(text: string | null): string {
  if (!text) return '—'
  try {
    const p = JSON.parse(text)
    if (typeof p === 'string') return p
    if (Array.isArray(p)) return p.join(', ')
    if (typeof p === 'object' && p !== null) {
      const addr = p as Record<string, string>
      const parts = [addr.street, addr.number, addr.complement, addr.neighborhood, addr.city, addr.state].filter(Boolean)
      return parts.join(', ') || JSON.stringify(p)
    }
    return String(p)
  } catch { return text }
}

function calculateAge(dateStr: string): number | null {
  try {
    const birth = new Date(dateStr)
    if (isNaN(birth.getTime())) return null
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    if (
      today.getMonth() < birth.getMonth() ||
      (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
    ) age--
    return age
  } catch { return null }
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right">{value || '—'}</span>
    </div>
  )
}

/** Linha que exibe valor antigo taxado em vermelho + novo valor em verde quando há alteração */
function ChangedRow({
  label,
  value,
  changes,
}: {
  label: string
  value: React.ReactNode
  changes: Record<string, { old: string; new: string }> | null
}) {
  const diff = changes?.[label] as { old: string; new: string } | undefined
  if (!diff) return <Row label={label} value={value} />
  return (
    <div className="flex justify-between gap-2 text-sm items-start">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right flex flex-col gap-0.5 items-end">
        <span className="line-through text-red-500 text-xs leading-tight">{diff.old}</span>
        <span className="font-semibold text-green-700 leading-tight">{diff.new}</span>
      </span>
    </div>
  )
}

function ScoreRow({ label, value, color }: { label: string; value: number | null | undefined; color: string }) {
  if (value == null) return <Row label={label} value={null} />
  return (
    <div className="flex justify-between gap-2 items-center text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <div className="flex items-center gap-2">
        <div className="w-20 h-1.5 rounded-full bg-gray-200 overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
        </div>
        <span className="font-bold text-right w-10 text-right">{Math.round(value)}%</span>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function CandidatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string>>
}) {
  const { id } = await params
  const sp = await searchParams
  const activeTab: 'curriculo' | 'ficha' | 'contrato' | 'documentos' | 'advertencias' | 'bancarios' | 'ferias' | 'atestados' =
    sp.tab === 'ficha' ? 'ficha'
    : sp.tab === 'contrato' ? 'contrato'
    : sp.tab === 'documentos' ? 'documentos'
    : sp.tab === 'advertencias' ? 'advertencias'
    : sp.tab === 'bancarios' ? 'bancarios'
    : sp.tab === 'ferias' ? 'ferias'
    : sp.tab === 'atestados' ? 'atestados'
    : 'curriculo'

  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  const role = ((user?.user_metadata?.role as string | undefined) === 'recrutador' ? 'recrutador' : 'master') as 'master' | 'recrutador'
  const isMaster = role === 'master'

  const { data: candidate } = await supabase
    .from('candidates').select('*').eq('id', id).single()
  if (!candidate) notFound()

  const { data: applications } = await supabase
    .from('applications').select('*, jobs(title)')
    .eq('candidate_id', id).order('created_at', { ascending: false })

  const latestApp = applications?.[0]

  const { data: formAnswers } = latestApp ? await supabase
    .from('form_answers')
    .select('*, form_questions(question_text, field_type, category)')
    .eq('application_id', latestApp.id) : { data: [] }

  const { data: cultureAnswers } = latestApp ? await supabase
    .from('culture_answers')
    .select('*, culture_questions(question_text, culture_value, options)')
    .eq('application_id', latestApp.id) : { data: [] }

  const { data: notes } = await supabase
    .from('admin_notes').select('*').eq('candidate_id', id)
    .order('created_at', { ascending: false })

  const { data: allJobs } = await supabase
    .from('jobs').select('id, title').eq('is_active', true).order('title')

  // Dados extras para a aba Ficha Admissão
  const service = await createSupabaseServiceClient()
  const [{ data: brand }, { data: companiesData }] = await Promise.all([
    service.from('ai_settings').select('company_name').limit(1).single(),
    service.from('companies').select('id, apelido, razao_social, cnpj').order('created_at', { ascending: false }),
  ])
  const fichaCompanies = (companiesData || []) as CompanyOption[]
  const admissionForm = (latestApp?.admission_form as AdmissionFormData | null) ?? null
  const companyDocs = (latestApp?.company_docs as Record<string, unknown> | null) ?? null
  const bankData = (latestApp?.bank_data as BankData | null) ?? null

  // Advertências + Férias + Atestados + Faltas
  const [{ data: warningsData }, { data: vacationsData }, { data: certificatesData }, { data: absencesData }] = await Promise.all([
    service.from('warnings').select('*').eq('candidate_id', id).order('occurred_at', { ascending: false }),
    service.from('vacations').select('*').eq('candidate_id', id).order('start_date', { ascending: false }),
    service.from('medical_certificates').select('*').eq('candidate_id', id).order('certificate_date', { ascending: false }),
    service.from('absences').select('*').eq('candidate_id', id).order('absence_date', { ascending: false }),
  ])

  const currentStatus = (latestApp?.status || 'novo') as CandidateStatus
  const isContratado = currentStatus === 'contratado'
  // Painel Resumo (faixa de colaborador) + aba renomeada para "Resumo"
  const showResumoPanel = ['contratado', 'freelancer', 'aprovado', 'em_contrato'].includes(currentStatus)
  // Dados Bancários: contratado, freelancer, intermitente, em contrato
  const showBankTab = ['contratado', 'freelancer', 'aprovado', 'em_contrato'].includes(currentStatus)
  // Ficha Admissão: contratado, intermitente (não em_contrato)
  const showFicha = ['contratado', 'aprovado'].includes(currentStatus)
  // Dados para contrato: em_contrato
  const showContract = currentStatus === 'em_contrato'
  // Documentos: contratado, intermitente, em contrato
  const showDocumentos = ['contratado', 'aprovado', 'em_contrato'].includes(currentStatus)
  // Férias: apenas contratado
  const showVacationTab = isContratado
  // Advertências + Atestados: apenas contratado
  const showRecords = isContratado
  // Painel enxuto (não-contratado)
  const minimalResumo = showResumoPanel && !isContratado

  // Job title: join → job_id direto → form_answer job_select (pode ser UUID → lookup)
  let jobTitle: string | null = (latestApp?.jobs as { title?: string } | null)?.title ?? null

  if (!jobTitle && latestApp?.job_id) {
    const { data: jobRow } = await supabase
      .from('jobs').select('title').eq('id', latestApp.job_id).single()
    jobTitle = jobRow?.title ?? null
  }

  if (!jobTitle) {
    const jobSelectAnswer = (formAnswers || []).find(
      a => (a.form_questions as { field_type?: string } | null)?.field_type === 'job_select'
    )?.answer_text
    if (jobSelectAnswer) {
      const parsed = parseAnswer(jobSelectAnswer)
      if (parsed && parsed !== '—') {
        // Se for UUID, busca o título no banco
        const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        if (uuidRe.test(parsed.trim())) {
          const { data: jobRow } = await supabase
            .from('jobs').select('title').eq('id', parsed.trim()).single()
          jobTitle = jobRow?.title ?? null
        } else {
          jobTitle = parsed
        }
      }
    }
  }

  // ── Extract key fields from form_answers ─────────────────────────────────
  const allFa = formAnswers || []

  // Endereço a partir de form_answers (field_type 'address' ou 'cep')
  let parsedAddress: CandidateAddress | null = null
  const addrAnswer = allFa.find(a => {
    const ft = (a.form_questions as { field_type?: string } | null)?.field_type
    return (ft === 'address' || ft === 'cep') && a.answer_text && a.answer_text.trim().startsWith('[')
  })?.answer_text
    ?? allFa.find(a => {
      const ft = (a.form_questions as { field_type?: string } | null)?.field_type
      return ft === 'address' || ft === 'cep'
    })?.answer_text
  if (addrAnswer) {
    try {
      const raw = JSON.parse(addrAnswer as string)
      if (Array.isArray(raw)) {
        // Formato do formulário de cadastro: [street, number, neighborhood, city, cep]
        parsedAddress = {
          street: raw[0] || '', number: raw[1] || '', complement: '',
          neighborhood: raw[2] || '', city: raw[3] || '', cep: raw[4] || '',
        }
      } else if (typeof raw === 'object' && raw !== null) {
        parsedAddress = {
          street: raw.street || raw.logradouro || '',
          number: raw.number || raw.numero || '',
          complement: raw.complement || raw.complemento || '',
          neighborhood: raw.neighborhood || raw.bairro || '',
          city: raw.city || raw.cidade || '',
          cep: raw.cep || raw.zipCode || '',
        }
      }
    } catch { /* ignora */ }
  }

  const photoUrl = parseAnswer(
    allFa.find(a => (a.form_questions as { field_type?: string } | null)?.field_type === 'file_upload')?.answer_text ?? null
  )
  const cpf = parseAnswer(
    allFa.find(a => (a.form_questions as { field_type?: string } | null)?.field_type === 'cpf')?.answer_text ?? null
  )
  const birthDateRaw = parseAnswer(
    allFa.find(a => (a.form_questions as { field_type?: string } | null)?.field_type === 'date')?.answer_text ?? null
  )
  const addressRaw = parseAnswer(
    allFa.find(a => (a.form_questions as { field_type?: string } | null)?.field_type === 'address')?.answer_text ?? null
  )

  const birthDate = birthDateRaw !== '—' ? birthDateRaw : null
  const age = birthDate ? calculateAge(birthDate) : null

  // ── Filter form answers shown in the experience section ───────────────────
  const filteredAnswers = allFa.filter(a => {
    const q = a.form_questions as { question_text?: string; field_type?: string } | null
    if (!q) return false
    if (HIDE_FIELD_TYPES.has(q.field_type ?? '')) return false
    const qLower = (q.question_text ?? '').toLowerCase()
    if (HIDE_QUESTION_PATTERNS.some(p => qLower.includes(p))) return false
    return true
  })

  // ── Score colors ──────────────────────────────────────────────────────────
  function scoreColor(v: number | null | undefined) {
    if (v == null) return 'bg-gray-300'
    if (v >= 70) return 'bg-emerald-500'
    if (v >= 50) return 'bg-amber-400'
    return 'bg-red-400'
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-5xl mx-auto">

      {/* ── Back button ── */}
      <Link
        href="/admin/candidatos"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Candidatos
      </Link>

      {/* ── Header ── */}
      <div className="flex items-start gap-4 flex-wrap">
        {/* Photo 3x4 — clickable popup */}
        {photoUrl !== '—'
          ? <PhotoViewer src={photoUrl} name={candidate.full_name} />
          : <PhotoPlaceholder />
        }

        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold leading-tight">{candidate.full_name}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge className={`text-xs ${STATUS_COLORS[currentStatus]}`}>
              {STATUS_LABELS[currentStatus]}
            </Badge>
            {applications && applications.length > 1 && (
              <Badge variant="outline" className="text-xs">{applications.length} candidaturas</Badge>
            )}
          </div>
          {isMaster && activeTab === 'curriculo' && <CandidateActions
            candidateId={id}
            applicationId={latestApp?.id}
            currentStatus={currentStatus}
            cultureTestDone={(cultureAnswers?.length || 0) > 0}
            cultureScore={latestApp?.culture_score}
            cultureAnswersSummary={(cultureAnswers || []).map(a => {
              const q = a.culture_questions as { question_text?: string; options?: string[] } | null
              const opts: string[] = (q?.options as string[]) || []
              const letter = (a.selected_option as string || '').toUpperCase()
              const idx = ['A', 'B', 'C', 'D'].indexOf(letter)
              const fullText = idx >= 0 && opts[idx] ? opts[idx] : letter
              return {
                question: q?.question_text || '',
                answer: fullText,
                score: a.score || 0,
              }
            })}
            initialBackgroundCheck={(candidate.background_check_result as BackgroundCheckResult | null) ?? null}
            initialBackgroundCheckAt={candidate.background_check_at ?? null}
            candidateCpf={(candidate.cpf as string | null) ?? null}
            hasExistingAnalysis={!!latestApp?.ai_summary}
          />}
        </div>

        {/* PDF button — canto superior direito (só Currículo e Ficha) */}
        {(activeTab === 'curriculo' || activeTab === 'ficha') && (
          <Link
            href={activeTab === 'ficha'
              ? `/admin/candidatos/${id}/print-ficha`
              : `/admin/candidatos/${id}/print`}
            target="_blank"
            className="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
          >
            <FileDown className="w-4 h-4" />
            Exportar PDF
          </Link>
        )}
      </div>

      {/* ── Tabs: Currículo | Ficha Admissão ── */}
      <CandidateTabNav candidateId={id} showResumo={showResumoPanel} showBankTab={showBankTab} showVacationTab={showVacationTab} showFicha={showFicha} showContract={showContract} showDocumentos={showDocumentos} showRecords={showRecords} />

      {/* ── Aba: Ficha Admissão ── */}
      {activeTab === 'ficha' && showFicha && (
        <FichaAdmissaoForm
          candidate={{
            id: candidate.id,
            full_name: candidate.full_name,
            phone: (candidate.phone as string | null) ?? null,
            email: (candidate.email as string | null) ?? null,
            cpf: (candidate.cpf as string | null) ?? null,
            city: (candidate.city as string | null) ?? null,
            neighborhood: (candidate.neighborhood as string | null) ?? null,
            address: parsedAddress,
          }}
          jobTitle={jobTitle}
          companyName={brand?.company_name ?? null}
          initialData={admissionForm}
          companies={fichaCompanies}
        />
      )}

      {/* ── Aba: Dados para contrato ── */}
      {activeTab === 'contrato' && showContract && (
        <DadosContratoTab
          candidateId={id}
          fullName={candidate.full_name}
          cpf={cpf !== '—' ? cpf : ((candidate.cpf as string | null) ?? null)}
          address={parsedAddress}
          jobTitle={jobTitle}
          initialData={(latestApp?.contract_data as ContractData | null) ?? null}
          companies={fichaCompanies}
        />
      )}

      {/* ── Aba: Documentos ── */}
      {activeTab === 'documentos' && showDocumentos && (
        <DocumentosTab candidateId={id} initialDocs={companyDocs} />
      )}

      {/* ── Aba: Advertências ── */}
      {activeTab === 'advertencias' && showRecords && (
        <AdvertenciasTab candidateId={id} initialWarnings={warningsData || []} />
      )}

      {/* ── Aba: Atestados ── */}
      {activeTab === 'atestados' && showRecords && (
        <AtestadosTab candidateId={id} initialCertificates={certificatesData || []} />
      )}

      {/* ── Aba: Dados Bancários ── */}
      {activeTab === 'bancarios' && showBankTab && (
        <DadosBancariosTab candidateId={id} initialData={bankData} />
      )}

      {/* ── Aba: Férias ── */}
      {activeTab === 'ferias' && showVacationTab && (
        <FeriasTab
          candidateId={id}
          admissionDate={admissionForm?.admission_date || null}
          initialVacations={vacationsData || []}
          initialAbsences={absencesData || []}
        />
      )}

      {/* ── Aba: Resumo/Currículo ── */}
      {activeTab === 'curriculo' && <>

      {/* Painel do colaborador (contratado / intermitente / freelancer / em contrato) */}
      {showResumoPanel && (
        <div className="mb-5">
          <ResumoColaborador
            fullName={candidate.full_name}
            jobTitle={jobTitle}
            companyName={fichaCompanies.find(c => c.id === admissionForm?.selected_company_id)?.apelido
              ?? fichaCompanies.find(c => c.id === admissionForm?.selected_company_id)?.razao_social
              ?? null}
            statusLabel={STATUS_LABELS[currentStatus]}
            cpf={cpf !== '—' ? cpf : ((candidate.cpf as string | null) ?? null)}
            phone={candidate.phone as string | null}
            email={candidate.email as string | null}
            city={candidate.city as string | null}
            age={age}
            admissionDate={admissionForm?.admission_date || null}
            salary={admissionForm?.salary || null}
            registeredAt={candidate.created_at}
            warningsCount={(warningsData || []).length}
            minimal={minimalResumo}
          />
        </div>
      )}

      {/* ── Cards de resumo ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Dados Pessoais */}
        {(() => {
          const changes = candidate.data_changes as Record<string, { old: string; new: string }> | null
          const hasChanges = changes && Object.keys(changes).length > 0
          return (
            <Card className={hasChanges ? 'border-orange-300 ring-1 ring-orange-200' : ''}>
              <CardHeader className="pb-2 flex flex-row items-center gap-2">
                <CardTitle className="text-sm flex-1">Dados Pessoais</CardTitle>
                {hasChanges && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">
                    <RefreshCw className="w-3 h-3" />
                    Atualizado
                    {candidate.data_updated_at ? ` em ${formatDate(candidate.data_updated_at)}` : ''}
                  </span>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                <ChangedRow label="Nome" value={candidate.full_name} changes={changes} />
                {birthDate && (
                  <Row
                    label="Nascimento"
                    value={`${formatDate(birthDate)}${age != null ? ` (${age} anos)` : ''}`}
                  />
                )}
                {cpf !== '—' && <Row label="CPF" value={cpf} />}
                <ChangedRow label="Telefone" value={candidate.phone} changes={changes} />
                <ChangedRow label="E-mail" value={candidate.email} changes={changes} />
                {addressRaw !== '—' && <Row label="Endereço" value={addressRaw} />}
                {candidate.neighborhood && <Row label="Bairro" value={candidate.neighborhood} />}
                <ChangedRow label="Cidade" value={candidate.city} changes={changes} />
                <Row label="Cadastro" value={formatDate(candidate.created_at)} />
              </CardContent>
            </Card>
          )
        })()}

        {/* Candidatura Atual */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Candidatura Atual</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {latestApp ? (
              <>
                {isMaster ? (
                  <EditVagaButton
                    applicationId={latestApp.id}
                    currentJobId={latestApp.job_id ?? null}
                    currentJobTitle={jobTitle}
                    jobs={allJobs || []}
                  />
                ) : (
                  <Row label="Vaga" value={jobTitle} />
                )}
                <Row label="Data" value={formatDate(latestApp.created_at)} />
                <div className="pt-1 space-y-1.5">
                  <ScoreRow label="Compatib. Cultural" value={latestApp.culture_score} color={scoreColor(latestApp.culture_score)} />
                  <ScoreRow label="Experiência" value={latestApp.experience_score} color={scoreColor(latestApp.experience_score)} />
                  <ScoreRow label="Disponibilidade" value={latestApp.availability_score} color={scoreColor(latestApp.availability_score)} />
                  <div className="border-t pt-1.5">
                    <ScoreRow label="Nota Final" value={latestApp.final_score} color={scoreColor(latestApp.final_score)} />
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Sem candidatura</p>
            )}
          </CardContent>
        </Card>

        {/* Parecer da IA */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Parecer da IA</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            {latestApp?.ai_summary ? (
              <>
                <p className="text-muted-foreground text-xs leading-relaxed">{latestApp.ai_summary}</p>
                {latestApp.ai_recommendation && (
                  <p className="font-medium text-xs border-t pt-2">{latestApp.ai_recommendation}</p>
                )}
                {latestApp.ai_status_suggestion && (
                  <p className="text-xs text-muted-foreground">
                    Sugestão: {STATUS_LABELS[latestApp.ai_status_suggestion as CandidateStatus] || latestApp.ai_status_suggestion}
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground text-sm">Análise não realizada — use o botão &quot;Analisar IA&quot; acima.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Alerta: Processos Judiciais ── */}
      {(() => {
        const judicial = latestApp?.ai_judicial_alert as { encontrado?: boolean; itens?: Array<{ fonte?: string; url?: string; descricao?: string }> } | null
        if (!judicial?.encontrado || !judicial.itens?.length) return null
        return (
          <div className="rounded-xl border-2 border-red-400 bg-red-50 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
              <span className="font-bold text-red-700 text-sm">⚠️ Processos Judiciais Encontrados</span>
            </div>
            <ul className="space-y-2 mt-1">
              {judicial.itens.map((item, i) => (
                <li key={i} className="text-sm flex flex-col gap-0.5">
                  <span className="text-red-800 font-medium">{item.descricao || 'Processo encontrado'}</span>
                  {item.fonte && <span className="text-xs text-red-500 uppercase tracking-wide">{item.fonte}</span>}
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-red-600 underline hover:text-red-800 flex items-center gap-1 w-fit"
                    >
                      <Globe className="w-3 h-3" />
                      {item.url.length > 70 ? item.url.slice(0, 70) + '…' : item.url}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )
      })()}
      {/* ── Pontos fortes / atenção ── */}
      {((latestApp?.ai_strengths as string[])?.length > 0 || (latestApp?.ai_risks as string[])?.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(latestApp?.ai_strengths as string[])?.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-emerald-700">Pontos Fortes</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {(latestApp!.ai_strengths as string[]).map((p, i) => (
                    <li key={i} className="text-sm flex gap-2"><span className="text-emerald-500 shrink-0">✓</span>{p}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {(latestApp?.ai_risks as string[])?.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-amber-700">Pontos de Atenção</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {(latestApp!.ai_risks as string[]).map((p, i) => (
                    <li key={i} className="text-sm flex gap-2"><span className="text-amber-500 shrink-0">!</span>{p}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Formulário de Experiência (sem dados pessoais) ── */}
      {filteredAnswers.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Formulário de Experiência</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {filteredAnswers.map(a => (
              <div key={a.id} className="text-sm border-b pb-2 last:border-0">
                <p className="text-muted-foreground text-xs">{(a.form_questions as { question_text?: string } | null)?.question_text}</p>
                <p className="mt-0.5 font-medium whitespace-pre-wrap">{parseAnswer(a.answer_text)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Teste Cultural ── */}
      {cultureAnswers && cultureAnswers.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Teste Cultural</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {cultureAnswers.map(a => {
              const qc = a.culture_questions as { question_text?: string; culture_value?: string; options?: string[] } | null
              const opts: string[] = (qc?.options as string[]) || []
              const letter = (a.selected_option as string || '').toUpperCase()
              const idx = ['A', 'B', 'C', 'D'].indexOf(letter)
              const fullAnswer = idx >= 0 && opts[idx] ? opts[idx] : letter
              return (
              <div key={a.id} className="text-sm border-b pb-2 last:border-0 flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-muted-foreground text-xs">{qc?.question_text}</p>
                  <p className="mt-0.5 font-medium leading-snug">{fullAnswer || '—'}</p>
                  <p className="text-xs text-muted-foreground">{qc?.culture_value}</p>
                </div>
                <span className={`text-sm font-bold shrink-0 ${(a.score || 0) >= 8 ? 'text-emerald-600' : (a.score || 0) >= 5 ? 'text-amber-600' : 'text-red-600'}`}>
                  {a.score ?? 0}/10
                </span>
              </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* ── Histórico ── */}
      {applications && applications.length > 1 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Histórico de Candidaturas</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead><tr className="text-muted-foreground text-xs border-b">
                <th className="text-left pb-2">Data</th>
                <th className="text-left pb-2">Vaga</th>
                <th className="text-left pb-2">Status</th>
                <th className="text-left pb-2">Nota</th>
              </tr></thead>
              <tbody>
                {applications.map(a => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="py-2">{formatDate(a.created_at)}</td>
                    <td className="py-2">{(a.jobs as { title?: string } | null)?.title || '—'}</td>
                    <td className="py-2">
                      <Badge className={`text-xs ${STATUS_COLORS[a.status as CandidateStatus]}`}>
                        {STATUS_LABELS[a.status as CandidateStatus] || a.status}
                      </Badge>
                    </td>
                    <td className="py-2">{a.final_score != null ? `${(a.final_score as number).toFixed(0)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ── Observações Internas ── */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Observações Internas</CardTitle></CardHeader>
        <CardContent>
          <CandidateNotesEditor
            candidateId={id}
            applicationId={latestApp?.id}
            initialNotes={(notes || []).map(n => ({
              id: n.id as string,
              note: n.note as string,
              created_at: n.created_at as string,
            }))}
          />
        </CardContent>
      </Card>

      {/* ── IP de Registro + Hora de Cadastro ── */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {candidate.ip_address && (
          <div className="flex items-center gap-1.5 border rounded-lg px-3 py-2 bg-gray-50">
            <Globe className="w-3.5 h-3.5 shrink-0" />
            <span>IP de cadastro: <code className="font-mono">{candidate.ip_address}</code></span>
          </div>
        )}
        <div className="flex items-center gap-1.5 border rounded-lg px-3 py-2 bg-gray-50">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>Cadastrado em: <strong className="text-gray-700 font-medium">{formatDateTime(candidate.created_at)}</strong></span>
        </div>
      </div>

      {/* ── Remover Currículo ── */}
      {isMaster && <DeleteCandidateSection candidateId={id} candidateName={candidate.full_name} />}

      </> /* fim aba Currículo */}

    </div>
  )
}
