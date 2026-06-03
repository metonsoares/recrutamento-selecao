import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; certificateId: string }> },
) {
  try {
    const { certificateId } = await params
    const supabase = await createSupabaseServiceClient()

    const { data: cert } = await supabase
      .from('medical_certificates').select('file_path').eq('id', certificateId).maybeSingle()
    if (cert?.file_path) {
      await supabase.storage.from('admission-docs').remove([cert.file_path]).catch(() => {})
    }

    const { error } = await supabase.from('medical_certificates').delete().eq('id', certificateId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[certificates DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
