import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const b = await req.json()
    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('climate_surveys')
      .update({
        title: b.title?.trim(),
        description: b.description || null,
        company_name: b.company_name || null,
        target_statuses: b.target_statuses || [],
        target_candidate_ids: b.target_candidate_ids || [],
        questions: b.questions || [],
      })
      .eq('id', id)
      .select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ survey: data })
  } catch (err) {
    console.error('[climate-surveys PUT]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createSupabaseServiceClient()
    const { error } = await supabase.from('climate_surveys').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[climate-surveys DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
