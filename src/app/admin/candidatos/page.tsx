import { requirePermission } from '@/lib/auth-guard'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { normalizeRole } from '@/lib/permissions'
import { CandidatesBoard } from './candidates-board'

export const dynamic = 'force-dynamic'

export default async function CandidatosPage() {
  await requirePermission('candidatos.ver')
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const role = (normalizeRole(user?.user_metadata?.role as string | undefined) === 'master' ? 'master' : 'recrutador') as 'master' | 'recrutador'

  const [{ data: candidates }, { data: jobs }, { data: settings }] = await Promise.all([
    supabase
      .from('candidates')
      .select(`
        *,
        applications!latest_application_id (
          id, status, job_id, final_score, culture_score, experience_score,
          availability_score, ai_summary, created_at,
          jobs ( title )
        )
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase.from('jobs').select('id, title').eq('is_active', true),
    supabase.from('ai_settings').select('id, kanban_column_order').limit(1).single(),
  ])

  // ── Fallback: busca vaga a partir das respostas do formulário ──────────────
  // Para candidatos cujo applications.job_id está null, buscamos a resposta do
  // campo job_select em form_answers e montamos um mapa appId -> jobTitle.
  const jobMap = Object.fromEntries((jobs || []).map(j => [j.id, j.title]))
  const appJobTitleMap: Record<string, string> = {}

  // Coleta appIds que não têm job via FK join
  type AppLike = { id?: string; job_id?: string | null; jobs?: unknown }
  const appIdsWithoutJob = (candidates || [])
    .map(c => {
      const app = (Array.isArray(c.applications)
        ? c.applications[0]
        : c.applications) as AppLike | null
      if (!app?.id) return null
      // Se já tem título via join, não precisa de fallback
      if (app.job_id && app.jobs) return null
      return app.id as string
    })
    .filter((id): id is string => id !== null)

  if (appIdsWithoutJob.length > 0) {
    // Questões do tipo job_select
    const { data: jobQs } = await supabase
      .from('form_questions')
      .select('id')
      .eq('field_type', 'job_select')

    const jobQIds = (jobQs || []).map(q => q.id as string)

    if (jobQIds.length > 0) {
      const { data: jobAnswers } = await supabase
        .from('form_answers')
        .select('application_id, answer_text')
        .in('application_id', appIdsWithoutJob)
        .in('question_id', jobQIds)

      for (const ans of jobAnswers || []) {
        const rawId = (ans.answer_text as string | null)?.replace(/^"|"$/g, '') ?? ''
        const title = jobMap[rawId]
        if (title && ans.application_id) {
          appJobTitleMap[ans.application_id as string] = title
        }
      }
    }
  }

  // ── Data de nascimento (campo 'date' do formulário) → idade ────────────────
  const latestAppIds = (candidates || [])
    .map(c => {
      const app = (Array.isArray(c.applications) ? c.applications[0] : c.applications) as { id?: string } | null
      return app?.id
    })
    .filter((id): id is string => !!id)

  if (latestAppIds.length > 0) {
    const { data: dateQs } = await supabase.from('form_questions').select('id').eq('field_type', 'date')
    const dateQIds = (dateQs || []).map(q => q.id as string)
    if (dateQIds.length > 0) {
      const dobByApp: Record<string, string> = {}
      // busca em blocos (evita limite de itens no .in)
      for (let i = 0; i < latestAppIds.length; i += 200) {
        const slice = latestAppIds.slice(i, i + 200)
        const { data: dobAnswers } = await supabase
          .from('form_answers').select('application_id, answer_text')
          .in('application_id', slice).in('question_id', dateQIds)
        for (const a of dobAnswers || []) {
          const raw = (a.answer_text as string | null)?.replace(/^"|"$/g, '').trim()
          if (raw && a.application_id && !dobByApp[a.application_id as string]) dobByApp[a.application_id as string] = raw
        }
      }
      for (const c of candidates || []) {
        const app = (Array.isArray(c.applications) ? c.applications[0] : c.applications) as { id?: string } | null
        if (app?.id && dobByApp[app.id]) (c as Record<string, unknown>).birth_date = dobByApp[app.id]
      }
    }
  }

  const columnOrder = (settings?.kanban_column_order as string[] | null) ?? null
  const settingsId = settings?.id ?? null

  return (
    <CandidatesBoard
      candidates={candidates || []}
      jobs={jobs || []}
      columnOrder={columnOrder}
      settingsId={settingsId}
      appJobTitleMap={appJobTitleMap}
      role={role}
    />
  )
}
