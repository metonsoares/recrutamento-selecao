import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requirePermissionApi } from '@/lib/auth-guard'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; absenceId: string }> },
) {
  try {
    const denied = await requirePermissionApi('ficha.ferias')
    if (denied) return denied
    const { absenceId } = await params
    const supabase = await createSupabaseServiceClient()
    const { error } = await supabase.from('absences').delete().eq('id', absenceId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[absences DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
