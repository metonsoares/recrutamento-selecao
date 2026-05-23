import { createSupabaseServerClient } from '@/lib/supabase-server'
import { CandidatesBoard } from './candidates-board'

export const dynamic = 'force-dynamic'

export default async function CandidatosPage() {
  const supabase = await createSupabaseServerClient()

  const [{ data: candidates }, { data: jobs }] = await Promise.all([
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
  ])

  return <CandidatesBoard candidates={candidates || []} jobs={jobs || []} />
}
