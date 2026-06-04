import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; recordId: string }> }) {
  try {
    const { recordId } = await params
    const supabase = await createSupabaseServiceClient()
    const { data: r } = await supabase.from('records').select('file_path').eq('id', recordId).maybeSingle()
    if (r?.file_path) await supabase.storage.from('admission-docs').remove([r.file_path]).catch(() => {})
    const { error } = await supabase.from('records').delete().eq('id', recordId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[records DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
