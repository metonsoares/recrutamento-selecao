import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  try {
    const { fileId } = await params
    const supabase = await createSupabaseServiceClient()
    const { data: f } = await supabase.from('employee_files').select('file_path').eq('id', fileId).maybeSingle()
    if (f?.file_path) await supabase.storage.from('admission-docs').remove([f.file_path]).catch(() => {})
    const { error } = await supabase.from('employee_files').delete().eq('id', fileId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[employee-files DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
