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
      .from('vacations')
      .select('*')
      .eq('candidate_id', id)
      .order('start_date', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ vacations: data })
  } catch (err) {
    console.error('[vacations GET]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const b = await req.json()
    if (!b.start_date || !b.end_date) {
      return NextResponse.json({ error: 'Datas de início e término são obrigatórias.' }, { status: 400 })
    }
    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('vacations')
      .insert({
        candidate_id: id,
        start_date: b.start_date,
        end_date: b.end_date,
        days: b.days ?? 0,
        abono: !!b.abono,
        abono_days: b.abono_days ?? 0,
        adiantamento_13: !!b.adiantamento_13,
        comment: b.comment || null,
        kind: b.kind === 'historico' ? 'historico' : 'solicitacao',
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ vacation: data })
  } catch (err) {
    console.error('[vacations POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
