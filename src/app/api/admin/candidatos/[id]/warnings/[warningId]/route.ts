import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requirePermissionApi } from '@/lib/auth-guard'

/** PUT — atualiza advertência */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; warningId: string }> },
) {
  try {
    const denied = await requirePermissionApi('ficha.advertencias')
    if (denied) return denied
    const { warningId } = await params
    const { occurred_at, reason, file_url, file_name, file_path } = await req.json()
    const supabase = await createSupabaseServiceClient()
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (occurred_at) payload.occurred_at = occurred_at
    if (reason !== undefined) payload.reason = reason
    if (file_url !== undefined) payload.file_url = file_url
    if (file_name !== undefined) payload.file_name = file_name
    if (file_path !== undefined) payload.file_path = file_path

    const { data, error } = await supabase
      .from('warnings')
      .update(payload)
      .eq('id', warningId)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ warning: data })
  } catch (err) {
    console.error('[warnings PUT]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/** DELETE — remove advertência (e arquivo do storage) */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; warningId: string }> },
) {
  try {
    const denied = await requirePermissionApi('ficha.advertencias')
    if (denied) return denied
    const { warningId } = await params
    const supabase = await createSupabaseServiceClient()

    // Remove arquivo do storage se existir
    const { data: w } = await supabase.from('warnings').select('file_path').eq('id', warningId).maybeSingle()
    if (w?.file_path) {
      await supabase.storage.from('admission-docs').remove([w.file_path]).catch(() => {})
    }

    const { error } = await supabase.from('warnings').delete().eq('id', warningId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[warnings DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
