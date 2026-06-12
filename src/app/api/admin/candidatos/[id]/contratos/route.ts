import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const b = await req.json()
    if (!b.title?.trim()) return NextResponse.json({ error: 'Informe o título do contrato.' }, { status: 400 })
    if (!b.contract_date) return NextResponse.json({ error: 'Informe a data do contrato.' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase.from('freelancer_contracts').insert({
      candidate_id: id,
      title: b.title.trim(),
      contract_date: b.contract_date,
      period_start: b.period_start || null,
      period_end: b.period_end || null,
      value: b.value != null && b.value !== '' ? Number(b.value) : null,
      notes: b.notes?.trim() || null,
      file_url: b.file_url || null,
      file_name: b.file_name || null,
      file_path: b.file_path || null,
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ contract: data })
  } catch (err) {
    console.error('[contratos POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
