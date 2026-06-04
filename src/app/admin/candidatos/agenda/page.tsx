import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { AgendaManager } from './agenda-manager'

export const dynamic = 'force-dynamic'

export default async function AgendaEntrevistasPage() {
  const supabase = await createSupabaseServiceClient()

  const [{ data: locations }, { data: interviewers }, { data: interviews }] = await Promise.all([
    supabase.from('interview_locations').select('*').order('created_at'),
    supabase.from('interviewers').select('*').order('created_at'),
    supabase.from('interviews')
      .select('*, candidates(full_name, phone), interviewers(name, phone), interview_locations(name, address)')
      .order('scheduled_at'),
  ])

  return (
    <AgendaManager
      initialLocations={(locations || []) as unknown as never[]}
      initialInterviewers={(interviewers || []) as unknown as never[]}
      initialInterviews={(interviews || []) as unknown as never[]}
    />
  )
}
