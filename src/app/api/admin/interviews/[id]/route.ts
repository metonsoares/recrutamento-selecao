import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const b = await req.json()
    const update: Record<string, unknown> = {}
    if (b.scheduled_at) update.scheduled_at = b.scheduled_at
    if (b.interviewer_id !== undefined) update.interviewer_id = b.interviewer_id || null
    if (b.location_id !== undefined) update.location_id = b.location_id || null
    if (b.duration_min !== undefined) update.duration_min = Number(b.duration_min) || 30
    if (b.status) update.status = b.status
    if (b.notes !== undefined) update.notes = b.notes?.trim() || null
    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase.from('interviews').update(update).eq('id', id)
      .select('*, candidates(full_name, phone), interviewers(name, phone), interview_locations(name, address)').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ interview: data })
  } catch { return NextResponse.json({ error: 'Erro interno.' }, { status: 500 }) }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServiceClient()
  const { error } = await supabase.from('interviews').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
