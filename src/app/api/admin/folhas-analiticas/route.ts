import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requirePermissionApi } from '@/lib/auth-guard'

const BUCKET = 'folhas-analiticas'
const MAX_SIZE = 25 * 1024 * 1024 // 25 MB — folha analítica costuma ser grande

/** POST — envia a folha analítica de uma empresa em uma competência. */
export async function POST(req: NextRequest) {
  try {
    const denied = await requirePermissionApi('documentos_empresa')
    if (denied) return denied

    const form = await req.formData()
    const file = form.get('file') as File | null
    const empresa = (form.get('empresa') as string | null)?.trim() || ''
    const competencia = (form.get('competencia') as string | null)?.trim() || '' // yyyy-mm-01

    if (!empresa) return NextResponse.json({ error: 'Escolha a empresa.' }, { status: 400 })
    if (!/^\d{4}-\d{2}-01$/.test(competencia)) {
      return NextResponse.json({ error: 'Informe o período (mês e ano).' }, { status: 400 })
    }
    if (!file) return NextResponse.json({ error: 'Anexe o arquivo PDF.' }, { status: 400 })
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'O arquivo precisa ser um PDF.' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Arquivo excede 25 MB.' }, { status: 400 })
    }

    const supabase = await createSupabaseServiceClient()

    // Uma folha por empresa/competência: substitui a anterior em vez de duplicar.
    const { data: existente } = await supabase
      .from('folhas_analiticas').select('id, file_path')
      .eq('empresa', empresa).eq('competencia', competencia).maybeSingle()

    const path = `${competencia.slice(0, 7)}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`
    const { error: upErr } = await supabase.storage
      .from(BUCKET).upload(path, await file.arrayBuffer(), { contentType: 'application/pdf', upsert: false })
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    if (existente) {
      await supabase.storage.from(BUCKET).remove([existente.file_path as string]).catch(() => {})
      const { error } = await supabase.from('folhas_analiticas')
        .update({ file_name: file.name, file_path: path })
        .eq('id', existente.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ ok: true, substituida: true })
    }

    const { error } = await supabase.from('folhas_analiticas')
      .insert({ empresa, competencia, file_name: file.name, file_path: path })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[folhas-analiticas POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/** DELETE — remove a folha e o arquivo do bucket. */
export async function DELETE(req: NextRequest) {
  try {
    const denied = await requirePermissionApi('documentos_empresa')
    if (denied) return denied

    const { id } = await req.json().catch(() => ({}))
    if (!id) return NextResponse.json({ error: 'Documento não informado.' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()
    const { data: folha } = await supabase
      .from('folhas_analiticas').select('file_path').eq('id', id).maybeSingle()
    if (folha?.file_path) {
      await supabase.storage.from(BUCKET).remove([folha.file_path as string]).catch(() => {})
    }
    const { error } = await supabase.from('folhas_analiticas').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[folhas-analiticas DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
