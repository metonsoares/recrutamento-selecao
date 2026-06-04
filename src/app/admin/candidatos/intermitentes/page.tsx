import { requirePermission } from '@/lib/auth-guard'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import Link from 'next/link'
import { ArrowLeft, Users, CalendarClock } from 'lucide-react'
import { IntermitentesTable } from './intermitentes-table'
import { countFichaPending, countCompanyPending } from '@/lib/doc-pendency'

export const dynamic = 'force-dynamic'

export default async function IntermitentesPage() {
  await requirePermission('colaboradores.ver')
  const supabase = await createSupabaseServiceClient()

  const { data: candidates } = await supabase
    .from('candidates')
    .select(`
      id, full_name, phone, email, created_at,
      applications!latest_application_id (
        id, status, admission_form, company_docs, jobs ( title )
      )
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  type AppRow = {
    id: string
    status: string
    admission_form: { function_title?: string; selected_company_id?: string; docs?: Record<string, unknown>; children_count?: string; alimony?: boolean | null } | null
    company_docs: Record<string, unknown> | null
    jobs: { title: string } | { title: string }[] | null
  }
  type CandidateRow = { id: string; full_name: string; phone: string | null; email: string | null; applications: AppRow | AppRow[] | null }

  const rows = (candidates || []) as CandidateRow[]
  const getApp = (c: CandidateRow): AppRow | null =>
    !c.applications ? null : (Array.isArray(c.applications) ? c.applications[0] : c.applications)

  function jobTitle(app: AppRow | null): string {
    if (app?.admission_form?.function_title) return app.admission_form.function_title
    const j = Array.isArray(app?.jobs) ? app?.jobs[0] : app?.jobs
    return j?.title || '—'
  }

  const lista = rows.filter(c => getApp(c)?.status === 'aprovado')

  // Empresas
  const { data: companiesData } = await supabase.from('companies').select('id, apelido, razao_social')
  const companyMap: Record<string, string> = {}
  for (const c of companiesData || []) companyMap[c.id] = c.apelido || c.razao_social || 'Empresa'

  // Fotos
  const appIds = lista.map(c => getApp(c)?.id).filter(Boolean) as string[]
  const photoMap: Record<string, string> = {}
  if (appIds.length > 0) {
    const { data: fileQuestions } = await supabase.from('form_questions').select('id').eq('field_type', 'file_upload')
    const fileQuestionIds = (fileQuestions ?? []).map(q => q.id)
    if (fileQuestionIds.length > 0) {
      const { data: photoAnswers } = await supabase
        .from('form_answers').select('application_id, answer_text')
        .in('application_id', appIds).in('question_id', fileQuestionIds)
      for (const pa of photoAnswers || []) {
        if (!photoMap[pa.application_id] && pa.answer_text) {
          const url = pa.answer_text.replace(/^"|"$/g, '')
          if (url.startsWith('http')) photoMap[pa.application_id] = url
        }
      }
    }
  }

  const tableRows = lista.map(c => {
    const app = getApp(c)
    const companyId = app?.admission_form?.selected_company_id
    const pend = countFichaPending(app?.admission_form ?? null) + countCompanyPending(app?.company_docs ?? null)
    return {
      id: c.id,
      full_name: c.full_name,
      photoUrl: app ? (photoMap[app.id] ?? null) : null,
      cargo: jobTitle(app),
      phone: c.phone,
      email: c.email,
      empresa: companyId ? (companyMap[companyId] ?? '') : '',
      pendencia: (pend > 0 ? 'pendente' : 'ok') as 'ok' | 'pendente',
    }
  })

  const companyOptions = Array.from(new Set(tableRows.map(r => r.empresa).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/candidatos" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex items-center gap-2">
          <CalendarClock className="w-6 h-6 text-emerald-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Intermitentes</h1>
            <p className="text-sm text-muted-foreground">
              {lista.length} candidato{lista.length !== 1 ? 's' : ''} intermitente{lista.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
            <Users className="w-8 h-8 text-gray-300" />
          </div>
          <div>
            <p className="font-medium text-gray-600">Nenhum intermitente ainda</p>
            <p className="text-sm text-muted-foreground mt-1">Candidatos com status &ldquo;Intermitentes&rdquo; aparecem aqui.</p>
          </div>
        </div>
      ) : (
        <IntermitentesTable rows={tableRows} companyOptions={companyOptions} />
      )}
    </div>
  )
}
