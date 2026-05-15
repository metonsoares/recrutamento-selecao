import { createSupabaseServerClient } from '@/lib/supabase-server'
import { CandidatesList } from './candidates-list'

export default async function CandidatosPage() {
  const supabase = await createSupabaseServerClient()
  const { data: candidates } = await supabase
    .from('candidates')
    .select(`
      *,
      applications!latest_application_id (
        id, status, final_score, culture_score, created_at,
        jobs ( title )
      )
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const { data: jobs } = await supabase.from('jobs').select('id, title').eq('is_active', true)

  return <CandidatesList candidates={candidates || []} jobs={jobs || []} />
}
