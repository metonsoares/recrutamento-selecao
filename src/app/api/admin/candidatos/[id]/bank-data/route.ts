import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: candidateId } = await params
    const body = await req.json()

    const supabase = await createSupabaseServiceClient()
    const { data: app } = await supabase
      .from('applications')
      .select('id')
      .eq('candidate_id', candidateId)
      .eq('is_latest', true)
      .maybeSingle()

    if (!app) return NextResponse.json({ error: 'Candidatura não encontrada.' }, { status: 404 })

    const { error } = await supabase
      .from('applications')
      .update({ bank_data: body, updated_at: new Date().toISOString() })
      .eq('id', app.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[bank-data PUT]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
