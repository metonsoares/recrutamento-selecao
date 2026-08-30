import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requirePermissionApi } from '@/lib/auth-guard'

/** PUT — atualiza data, observação e/ou arquivo do atestado */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; certificateId: string }> },
) {
  try {
    const denied = await requirePermissionApi('ficha.atestados')
    if (denied) return denied
    const { id, certificateId } = await params
    const { certificate_date, comment, file_url, file_name, file_path } = await req.json()
    const supabase = await createSupabaseServiceClient()

    const payload: Record<string, unknown> = {}
    if (certificate_date) payload.certificate_date = certificate_date
    if (comment !== undefined) payload.comment = comment || null
    if (file_url !== undefined) payload.file_url = file_url || null
    if (file_name !== undefined) payload.file_name = file_name || null
    if (file_path !== undefined) payload.file_path = file_path || null
    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 })
    }

    // Guarda o path atual para limpar o arquivo antigo do storage se for substituído
    let oldPath: string | null = null
    if (file_path !== undefined) {
      const { data: current } = await supabase
        .from('medical_certificates').select('file_path').eq('id', certificateId).eq('candidate_id', id).maybeSingle()
      oldPath = current?.file_path ?? null
    }

    const { data, error } = await supabase
      .from('medical_certificates')
      .update(payload)
      .eq('id', certificateId)
      .eq('candidate_id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    if (oldPath && oldPath !== (file_path || null)) {
      await supabase.storage.from('admission-docs').remove([oldPath]).catch(() => {})
    }
    return NextResponse.json({ certificate: data })
  } catch (err) {
    console.error('[certificates PUT]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; certificateId: string }> },
) {
  try {
    const denied = await requirePermissionApi('ficha.atestados')
    if (denied) return denied
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
