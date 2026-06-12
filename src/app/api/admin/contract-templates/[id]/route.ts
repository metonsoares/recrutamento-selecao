import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createSupabaseServiceClient()
    const { data: t } = await supabase.from('contract_templates').select('file_path').eq('id', id).maybeSingle()
    if (t?.file_path) { try { await supabase.storage.from('admission-docs').remove([t.file_path]) } catch { /* ignora */ } }
    const { error } = await supabase.from('contract_templates').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[contract-templates DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
