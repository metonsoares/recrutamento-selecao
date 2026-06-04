import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { sendWhatsAppRaw } from '@/lib/whatsapp'
import { slotsForDay, windowLabel, weekdayOf, SLOT_MIN, Win } from '@/lib/interview-slots'

const TZ = '-03:00'

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const { date } = await req.json()
    if (!date) return NextResponse.json({ error: 'Selecione um dia.' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()
    const { data: invite } = await supabase
      .from('interview_invites')
      .select('*, candidates(full_name, phone), interviewers(name, windows), interview_locations(name, address)')
      .eq('token', token).maybeSingle()
    if (!invite) return NextResponse.json({ error: 'Convite inválido.' }, { status: 404 })
    if (invite.status === 'agendada') return NextResponse.json({ error: 'Este convite já foi agendado.' }, { status: 409 })

    const dates = (invite.dates as string[]) || []
    if (!dates.includes(date)) return NextResponse.json({ error: 'Data indisponível.' }, { status: 400 })

    const interviewer = invite.interviewers as { name?: string; windows?: Win[] } | null
    const windows = interviewer?.windows || []
    const weekday = weekdayOf(date)
    const slots = slotsForDay(windows, weekday)
    if (slots.length === 0) return NextResponse.json({ error: 'Sem disponibilidade neste dia.' }, { status: 400 })

    // Posição por ordem de chegada
    const dayStart = `${date}T00:00:00${TZ}`, dayEnd = `${date}T23:59:59${TZ}`
    const { data: existing } = await supabase
      .from('interviews').select('id')
      .eq('interviewer_id', invite.interviewer_id).neq('status', 'cancelada')
      .gte('scheduled_at', dayStart).lte('scheduled_at', dayEnd)
    const position = (existing || []).length
    if (position >= slots.length) {
      return NextResponse.json({ error: 'Este dia ficou lotado. Por favor, escolha outro dia.' }, { status: 409 })
    }

    const time = slots[position]
    const scheduled_at = `${date}T${time}:00${TZ}`

    const { data: interview, error } = await supabase.from('interviews').insert({
      candidate_id: invite.candidate_id,
      interviewer_id: invite.interviewer_id,
      location_id: invite.location_id,
      scheduled_at,
      duration_min: SLOT_MIN,
      status: 'agendada',
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    await supabase.from('interview_invites').update({ status: 'agendada', interview_id: interview.id }).eq('id', invite.id)

    const { data: cand } = await supabase.from('candidates').select('latest_application_id').eq('id', invite.candidate_id).maybeSingle()
    if (cand?.latest_application_id) {
      await supabase.from('applications').update({ status: 'entrevista_agendada', updated_at: new Date().toISOString() }).eq('id', cand.latest_application_id)
    }

    // Confirmação por WhatsApp
    const candidate = invite.candidates as { full_name?: string; phone?: string } | null
    const location = invite.interview_locations as { name?: string; address?: string } | null
    const janela = windowLabel(windows, weekday)
    const diaFmt = new Date(`${date}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })
    const firstName = String(candidate?.full_name || '').split(' ')[0]
    const localTxt = location?.name ? `${location.name}${location.address ? ` (${location.address})` : ''}` : 'a ser informado'
    const msg = `Olá ${firstName}, sua entrevista foi agendada! ✅\n\n📅 Dia: ${diaFmt}\n🕐 Horário de atendimento: ${janela} (por ordem de chegada)\n📍 Local: ${localTxt}\n\nChegue dentro da janela de horário; o atendimento é por ordem de chegada. Até lá!`
    if (candidate?.phone) await sendWhatsAppRaw(candidate.phone, msg, 'interview_confirmation')

    return NextResponse.json({
      ok: true,
      date: diaFmt, window: janela, position: position + 1,
      location: location?.name || null, locationAddress: location?.address || null,
    })
  } catch (err) {
    console.error('[public interview-invite]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
