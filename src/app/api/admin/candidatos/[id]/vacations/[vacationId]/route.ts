import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requirePermissionApi } from '@/lib/auth-guard'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; vacationId: string }> },
) {
  try {
    const denied = await requirePermissionApi('ficha.ferias')
    if (denied) return denied
    const { vacationId } = await params
    const supabase = await createSupabaseServiceClient()
    const { error } = await supabase.from('vacations').delete().eq('id', vacationId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[vacations DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

// Edita um lançamento de férias (campos parciais) e/ou seus anexos
// (notificacao_file / recibo_file). Escopo id + candidate_id.
const EDITABLE = [
  'start_date', 'end_date', 'days', 'abono', 'abono_days',
  'adiantamento_13', 'comment', 'kind', 'notificacao_file', 'recibo_file',
] as const

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; vacationId: string }> },
) {
  try {
    const denied = await requirePermissionApi('ficha.ferias')
    if (denied) return denied
    const { id, vacationId } = await params
    const b = await req.json()
    const update: Record<string, unknown> = {}
    for (const k of EDITABLE) if (k in b) update[k] = b[k]
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 })
    }
    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('vacations')
      .update(update)
      .eq('id', vacationId)
      .eq('candidate_id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ vacation: data })
  } catch (err) {
    console.error('[vacations PUT]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
