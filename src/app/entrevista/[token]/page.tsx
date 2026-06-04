import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { slotsForDay, windowLabel, weekdayOf, Win } from '@/lib/interview-slots'
import { AgendarEntrevistaForm, DayOption } from './agendar-form'

export const dynamic = 'force-dynamic'

export default async function EntrevistaPublicPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createSupabaseServiceClient()

  const { data: invite } = await supabase
    .from('interview_invites')
    .select('*, candidates(full_name), interviewers(name, windows), interview_locations(name, address)')
    .eq('token', token).maybeSingle()

  if (!invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6 text-center">
        <div><h1 className="text-xl font-bold text-gray-900">Convite inválido</h1><p className="text-sm text-muted-foreground mt-1">Este link de agendamento não é válido.</p></div>
      </div>
    )
  }

  const candidate = invite.candidates as { full_name?: string } | null
  const interviewer = invite.interviewers as { name?: string; windows?: Win[] } | null
  const location = invite.interview_locations as { name?: string; address?: string } | null
  const windows = interviewer?.windows || []
  const dates = ((invite.dates as string[]) || []).slice().sort()

  const alreadyScheduled = invite.status === 'agendada'

  // Capacidade restante por dia
  const dayOptions: DayOption[] = []
  if (!alreadyScheduled) {
    for (const d of dates) {
      const weekday = weekdayOf(d)
      const slots = slotsForDay(windows, weekday)
      if (slots.length === 0) continue
      const { data: existing } = await supabase
        .from('interviews').select('id')
        .eq('interviewer_id', invite.interviewer_id).neq('status', 'cancelada')
        .gte('scheduled_at', `${d}T00:00:00-03:00`).lte('scheduled_at', `${d}T23:59:59-03:00`)
      const remaining = Math.max(0, slots.length - (existing || []).length)
      dayOptions.push({
        date: d,
        label: new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', timeZone: 'UTC' }),
        window: windowLabel(windows, weekday),
        remaining,
      })
    }
  }

  return (
    <AgendarEntrevistaForm
      token={token}
      candidateName={candidate?.full_name || ''}
      interviewerName={interviewer?.name || ''}
      locationName={location?.name || null}
      locationAddress={location?.address || null}
      days={dayOptions}
      alreadyScheduled={alreadyScheduled}
    />
  )
}
