import { createSupabaseServerClient } from '@/lib/supabase-server'
import { JobsManager } from './jobs-manager'

export default async function VagasPage() {
  const supabase = await createSupabaseServerClient()
  const { data: jobs } = await supabase
    .from('jobs')
    .select('*')
    .order('created_at', { ascending: false })

  return <JobsManager jobs={jobs || []} />
}
