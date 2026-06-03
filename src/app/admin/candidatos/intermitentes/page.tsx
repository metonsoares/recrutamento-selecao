import { createSupabaseServerClient } from '@/lib/supabase-server'
import Link from 'next/link'
import { ArrowLeft, Users, CalendarClock } from 'lucide-react'
import { FreelancersTable } from '../freelancers/freelancers-table'

export const dynamic = 'force-dynamic'

export default async function IntermitentesPage() {
  const supabase = await createSupabaseServerClient()

  const { data: candidates } = await supabase
    .from('candidates')
    .select(`
      id, full_name, phone, email, city, created_at,
      applications!latest_application_id (
        id, status, created_at, final_score,
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

  // Apenas candidatos com status 'aprovado' (coluna Intermitentes do Kanban)
  const intermitentes = rows.filter(c => getApp(c)?.status === 'aprovado')

  // Busca fotos
  const appIds = intermitentes.map(c => getApp(c)?.id).filter(Boolean) as string[]
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

  const tableRows = intermitentes.map(c => {
    const app = getApp(c)
    return {
      id: c.id,
      full_name: c.full_name,
      phone: c.phone,
      email: c.email,
      city: c.city,
      created_at: c.created_at,
      appId: app?.id ?? null,
      finalScore: app?.final_score ?? null,
      jobTitle: getJobTitle(app),
      photoUrl: app ? (photoMap[app.id] ?? null) : null,
    }
  })

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
          <CalendarClock className="w-6 h-6 text-emerald-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Intermitentes</h1>
            <p className="text-sm text-muted-foreground">
              {intermitentes.length} candidato{intermitentes.length !== 1 ? 's' : ''} intermitente{intermitentes.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Estado vazio */}
      {intermitentes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
            <Users className="w-8 h-8 text-gray-300" />
          </div>
          <div>
            <p className="font-medium text-gray-600">Nenhum intermitente ainda</p>
            <p className="text-sm text-muted-foreground mt-1">
              Candidatos com status &ldquo;Intermitentes&rdquo; aparecem aqui.
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
      {intermitentes.length > 0 && (
        <FreelancersTable rows={tableRows} />
      )}
    </div>
  )
}
