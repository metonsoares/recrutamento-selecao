import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

/** PUT — atualiza competência e/ou arquivo do registro */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  try {
    const { id, fileId } = await params
    const { reference, file_url, file_name, file_path, comprovante_file } = await req.json()
    const supabase = await createSupabaseServiceClient()

    const payload: Record<string, unknown> = {}
    if (reference !== undefined) payload.reference = reference || null
    if (file_url !== undefined) payload.file_url = file_url || null
    if (file_name !== undefined) payload.file_name = file_name || null
    if (file_path !== undefined) payload.file_path = file_path || null
    if (comprovante_file !== undefined) payload.comprovante_file = comprovante_file
    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 })
    }

    // Guarda o path atual para limpar o arquivo antigo do storage se for substituído
    let oldPath: string | null = null
    if (file_path !== undefined) {
      const { data: current } = await supabase
        .from('employee_files').select('file_path').eq('id', fileId).eq('candidate_id', id).maybeSingle()
      oldPath = current?.file_path ?? null
    }

    const { data, error } = await supabase
      .from('employee_files')
      .update(payload)
      .eq('id', fileId)
      .eq('candidate_id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    if (oldPath && oldPath !== (file_path || null)) {
      await supabase.storage.from('admission-docs').remove([oldPath]).catch(() => {})
    }
    return NextResponse.json({ file: data })
  } catch (err) {
    console.error('[employee-files PUT]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

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
