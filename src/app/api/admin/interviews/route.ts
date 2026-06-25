import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { notifyInterviewerScheduled } from '@/lib/interview-notify'

const SLOT_MIN = 30
const TZ = '-03:00' // Horário de Brasília

interface Win { weekday: number; start: string; end: string }

/** Gera os horários de início (HH:MM) de cada slot de 30 min dentro das janelas do dia. */
function slotsForDay(windows: Win[], weekday: number): string[] {
  const day = windows.filter(w => Number(w.weekday) === weekday)
    .sort((a, b) => a.start.localeCompare(b.start))
  const slots: string[] = []
  for (const w of day) {
    const [sh, sm] = w.start.split(':').map(Number)
    const [eh, em] = w.end.split(':').map(Number)
    let cur = sh * 60 + sm
    const end = eh * 60 + em
    while (cur + SLOT_MIN <= end) {
      slots.push(`${String(Math.floor(cur / 60)).padStart(2, '0')}:${String(cur % 60).padStart(2, '0')}`)
      cur += SLOT_MIN
    }
  }
  return slots
}

export async function GET() {
  const supabase = await createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('interviews')
    .select('*, candidates(full_name, phone), interviewers(name, phone), interview_locations(name, address)')
    .order('scheduled_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ interviews: data })
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json()
    if (!b.candidate_id) return NextResponse.json({ error: 'Selecione o candidato.' }, { status: 400 })
    if (!b.interviewer_id) return NextResponse.json({ error: 'Selecione o entrevistador.' }, { status: 400 })
    if (!b.date) return NextResponse.json({ error: 'Informe o dia da entrevista.' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()

    // Janelas do entrevistador para o dia da semana escolhido
    const { data: interviewer } = await supabase.from('interviewers').select('windows').eq('id', b.interviewer_id).maybeSingle()
    if (!interviewer) return NextResponse.json({ error: 'Entrevistador não encontrado.' }, { status: 404 })
    const weekday = new Date(`${b.date}T12:00:00Z`).getUTCDay()
    const slots = slotsForDay((interviewer.windows as Win[]) || [], weekday)
    if (slots.length === 0) {
      return NextResponse.json({ error: 'O entrevistador não tem janela de disponibilidade neste dia da semana.' }, { status: 400 })
    }

    // Posição por ordem de chegada = nº de entrevistas já agendadas para ele nesse dia
    const dayStart = `${b.date}T00:00:00${TZ}`
    const dayEnd = `${b.date}T23:59:59${TZ}`
    const { data: existing } = await supabase
      .from('interviews')
      .select('id')
      .eq('interviewer_id', b.interviewer_id)
      .neq('status', 'cancelada')
      .gte('scheduled_at', dayStart)
      .lte('scheduled_at', dayEnd)
    const position = (existing || []).length

    if (position >= slots.length) {
      return NextResponse.json({ error: `Capacidade esgotada: o entrevistador atende no máximo ${slots.length} entrevista(s) neste dia.` }, { status: 409 })
    }

    const time = slots[position]
    const scheduled_at = `${b.date}T${time}:00${TZ}`

    const { data, error } = await supabase.from('interviews').insert({
      candidate_id: b.candidate_id,
      interviewer_id: b.interviewer_id,
      location_id: b.location_id || null,
      scheduled_at,
      duration_min: SLOT_MIN,
      notes: b.notes?.trim() || null,
      status: 'agendada',
    }).select('*, candidates(full_name, phone), interviewers(name, phone), interview_locations(name, address)').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Notifica o entrevistador responsável sobre o novo agendamento
    await notifyInterviewerScheduled(data.id)

    // Atualiza status da candidatura mais recente para "entrevista_agendada"
    const { data: cand } = await supabase.from('candidates').select('latest_application_id').eq('id', b.candidate_id).maybeSingle()
    if (cand?.latest_application_id) {
      await supabase.from('applications').update({ status: 'entrevista_agendada', updated_at: new Date().toISOString() }).eq('id', cand.latest_application_id)
    }

    return NextResponse.json({ interview: data, position: position + 1, capacity: slots.length })
  } catch { return NextResponse.json({ error: 'Erro interno.' }, { status: 500 }) }
}
