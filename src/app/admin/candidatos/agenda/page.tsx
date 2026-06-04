import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { AgendaManager } from './agenda-manager'

export const dynamic = 'force-dynamic'

export default async function AgendaEntrevistasPage() {
  const supabase = await createSupabaseServiceClient()

  const [{ data: locations }, { data: interviewers }, { data: interviews }, { data: candidates }] = await Promise.all([
    supabase.from('interview_locations').select('*').order('created_at'),
    supabase.from('interviewers').select('*').order('created_at'),
    supabase.from('interviews')
      .select('*, candidates(full_name, phone), interviewers(name, phone), interview_locations(name, address)')
      .order('scheduled_at'),
    supabase.from('candidates').select(`
      id, full_name, phone,
      applications!latest_application_id ( status )
    `).is('deleted_at', null).order('full_name'),
  ])

  type AppLite = { status?: string }
  const elegiveis = (candidates || []).map(c => {
    const app = (Array.isArray(c.applications) ? c.applications[0] : c.applications) as AppLite | null
    return { id: c.id as string, name: c.full_name as string, phone: (c.phone as string | null) ?? null, status: app?.status || 'novo' }
  }).filter(c => ['novo', 'apto_para_entrevista', 'entrevista_agendada'].includes(c.status))

  return (
    <AgendaManager
      initialLocations={(locations || []) as unknown as never[]}
      initialInterviewers={(interviewers || []) as unknown as never[]}
      initialInterviews={(interviews || []) as unknown as never[]}
      candidates={elegiveis}
    />
  )
}
