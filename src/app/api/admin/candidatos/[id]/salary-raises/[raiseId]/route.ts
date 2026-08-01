import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; raiseId: string }> },
) {
  try {
    const { id, raiseId } = await params
    const supabase = await createSupabaseServiceClient()
    const { error } = await supabase
      .from('salary_raises')
      .delete()
      .eq('id', raiseId)
      .eq('candidate_id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[salary-raises DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
