import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; contractId: string }> }) {
  try {
    const { id, contractId } = await params
    const supabase = await createSupabaseServiceClient()
    const { error } = await supabase.from('freelancer_contracts').delete().eq('id', contractId).eq('candidate_id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[contratos DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
