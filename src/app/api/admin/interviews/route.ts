import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

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
    if (!b.scheduled_at) return NextResponse.json({ error: 'Informe data e hora.' }, { status: 400 })
    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase.from('interviews').insert({
      candidate_id: b.candidate_id,
      interviewer_id: b.interviewer_id || null,
      location_id: b.location_id || null,
      scheduled_at: b.scheduled_at,
      duration_min: Number(b.duration_min) || 30,
      notes: b.notes?.trim() || null,
      status: 'agendada',
    }).select('*, candidates(full_name, phone), interviewers(name, phone), interview_locations(name, address)').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Atualiza status da candidatura mais recente para "entrevista_agendada"
    const { data: cand } = await supabase.from('candidates').select('latest_application_id').eq('id', b.candidate_id).maybeSingle()
    if (cand?.latest_application_id) {
      await supabase.from('applications').update({ status: 'entrevista_agendada', updated_at: new Date().toISOString() }).eq('id', cand.latest_application_id)
    }

    return NextResponse.json({ interview: data })
  } catch { return NextResponse.json({ error: 'Erro interno.' }, { status: 500 }) }
}
