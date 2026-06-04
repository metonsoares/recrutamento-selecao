import { requirePermission } from '@/lib/auth-guard'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { JobsManager } from './jobs-manager'

export default async function VagasPage() {
  await requirePermission('curriculos.vagas')
  const supabase = await createSupabaseServerClient()
  const { data: jobs } = await supabase
    .from('jobs')
    .select('*')
    .order('created_at', { ascending: false })

  return <JobsManager jobs={jobs || []} />
}
