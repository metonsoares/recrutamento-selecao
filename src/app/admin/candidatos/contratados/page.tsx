import { requirePermission } from '@/lib/auth-guard'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import Link from 'next/link'
import { UserCheck, ArrowLeft, Users } from 'lucide-react'
import { ContratadosTable } from './contratados-table'

export const dynamic = 'force-dynamic'

export default async function ContratadosPage() {
  await requirePermission('colaboradores.ver')
  const supabase = await createSupabaseServerClient()

  // Busca candidatos com latest_application
  const { data: candidates } = await supabase
    .from('candidates')
    .select(`
      id, full_name, phone, email, city, created_at,
      applications!latest_application_id (
        id, status, created_at, final_score, culture_score, admission_form, company_docs,
        jobs ( title )
      )
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  type AppRow = {
    id: string
    status: string
    created_at: string
    final_score: number | null
    culture_score: number | null
    admission_form: { selected_company_id?: string; function_title?: string } | null
    company_docs: Record<string, { not_applicable?: boolean; files?: unknown[] }> | null
    jobs: { title: string } | { title: string }[] | null
  }

  type CandidateRow = {
    id: string
    full_name: string
    phone: string | null
    email: string | null
    city: string | null
    created_at: string
    applications: AppRow | AppRow[] | null
  }

  const rows = (candidates || []) as CandidateRow[]

  function getApp(c: CandidateRow): AppRow | null {
    if (!c.applications) return null
    return Array.isArray(c.applications) ? c.applications[0] : c.applications
  }

  function getJobTitle(app: AppRow | null): string {
    if (!app?.jobs) return '—'
    const j = Array.isArray(app.jobs) ? app.jobs[0] : app.jobs
    return j?.title || '—'
  }

  // Filtra contratados
  const contratados = rows.filter(c => getApp(c)?.status === 'contratado')

  // Mapa de empresas (id → apelido / razão social)
  const service = await createSupabaseServiceClient()
  const { data: companiesData } = await service
    .from('companies')
    .select('id, apelido, razao_social')
  const companyMap: Record<string, string> = {}
  for (const co of companiesData || []) {
    companyMap[co.id] = co.apelido || co.razao_social || 'Empresa'
  }

  // Busca fotos (file_upload) das candidaturas dos contratados
  const appIds = contratados.map(c => getApp(c)?.id).filter(Boolean) as string[]
  const photoMap: Record<string, string> = {}

  if (appIds.length > 0) {
    const { data: fileQuestions } = await supabase
      .from('form_questions')
      .select('id')
      .eq('field_type', 'file_upload')

    const fileQuestionIds = (fileQuestions ?? []).map(q => q.id)

    if (fileQuestionIds.length > 0) {
      const { data: photoAnswers } = await supabase
        .from('form_answers')
        .select('application_id, answer_text')
        .in('application_id', appIds)
        .in('question_id', fileQuestionIds)

      for (const pa of photoAnswers || []) {
        if (!photoMap[pa.application_id] && pa.answer_text) {
          const url = pa.answer_text.replace(/^"|"$/g, '')
          if (url.startsWith('http')) photoMap[pa.application_id] = url
        }
      }
    }
  }

  // Documentos da empresa exigidos (mesma lista da aba Documentos)
  const COMPANY_DOC_KEYS = [
    'ficha_registro', 'contrato_tempo_determinado', 'contrato_experiencia', 'contrato_trabalho', 'regulamento_interno',
    'banco_horas', 'cessao_imagem', 'vale_transporte', 'uniformes_epis',
    'acrm_geral', 'acrm_escala',
  ]

  function getPendencia(app: AppRow | null): 'ok' | 'pendente' {
    const docs = app?.company_docs
    if (!docs) return 'pendente'
    for (const key of COMPANY_DOC_KEYS) {
      const s = docs[key]
      const resolved = s?.not_applicable === true || (s?.files?.length ?? 0) > 0
      if (!resolved) return 'pendente'
    }
    return 'ok'
  }

  // Monta rows serializáveis para o Client Component
  const tableRows = contratados.map(c => {
    const app = getApp(c)
    const companyId = app?.admission_form?.selected_company_id
    return {
      id: c.id,
      full_name: c.full_name,
      phone: c.phone,
      email: c.email,
      city: c.city,
      created_at: c.created_at,
      appId: app?.id ?? null,
      appStatus: app?.status ?? null,
      finalScore: app?.final_score ?? null,
      jobTitle: app?.admission_form?.function_title || getJobTitle(app),
      companyName: companyId ? (companyMap[companyId] ?? null) : null,
      photoUrl: app ? (photoMap[app.id] ?? null) : null,
      pendencia: getPendencia(app),
    }
  })

  // Lista de empresas presentes nos contratados (para o filtro)
  const companyOptions = Array.from(
    new Set(tableRows.map(r => r.companyName).filter(Boolean) as string[])
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">

      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/candidatos"
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex items-center gap-2">
          <UserCheck className="w-6 h-6 text-emerald-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Contratados</h1>
            <p className="text-sm text-muted-foreground">
              {contratados.length} candidato{contratados.length !== 1 ? 's' : ''} contratado{contratados.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Estado vazio */}
      {contratados.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
            <Users className="w-8 h-8 text-gray-300" />
          </div>
          <div>
            <p className="font-medium text-gray-600">Nenhum contratado ainda</p>
            <p className="text-sm text-muted-foreground mt-1">
              Candidatos com status &ldquo;Contratado&rdquo; aparecem aqui.
            </p>
          </div>
          <Link
            href="/admin/candidatos"
            className="text-sm text-primary underline underline-offset-2"
          >
            Ver todos os candidatos
          </Link>
        </div>
      )}

      {/* Tabela */}
      {contratados.length > 0 && (
        <ContratadosTable rows={tableRows} companyOptions={companyOptions} />
      )}
    </div>
  )
}
