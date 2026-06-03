import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('absences')
      .select('*')
      .eq('candidate_id', id)
      .order('absence_date', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ absences: data })
  } catch (err) {
    console.error('[absences GET]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { absence_date, days, kind, comment } = await req.json()
    if (!absence_date) return NextResponse.json({ error: 'Data é obrigatória.' }, { status: 400 })
    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('absences')
      .insert({
        candidate_id: id,
        absence_date,
        days: Math.max(1, Number(days) || 1),
        kind: kind === 'afastamento' ? 'afastamento' : 'injustificada',
        comment: comment || null,
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ absence: data })
  } catch (err) {
    console.error('[absences POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
