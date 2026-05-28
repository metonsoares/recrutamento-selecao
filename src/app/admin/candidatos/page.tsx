import { createSupabaseServerClient } from '@/lib/supabase-server'
import { CandidatesBoard } from './candidates-board'

export const dynamic = 'force-dynamic'

export default async function CandidatosPage() {
  const supabase = await createSupabaseServerClient()

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

  const columnOrder = (settings?.kanban_column_order as string[] | null) ?? null
  const settingsId = settings?.id ?? null

  return <CandidatesBoard candidates={candidates || []} jobs={jobs || []} columnOrder={columnOrder} settingsId={settingsId} />
}
