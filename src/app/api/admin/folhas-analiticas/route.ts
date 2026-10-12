import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requirePermissionApi } from '@/lib/auth-guard'

const BUCKET = 'folhas-analiticas'
const MAX_SIZE = 25 * 1024 * 1024 // 25 MB — folha analítica costuma ser grande

/** POST — envia uma ou mais folhas analíticas de uma empresa em uma competência. */
export async function POST(req: NextRequest) {
  try {
    const denied = await requirePermissionApi('documentos_empresa')
    if (denied) return denied

    const form = await req.formData()
    // Um período pode ter mais de uma folha (empresa com mais de um lote, folha
    // complementar, 13º): cada arquivo vira um registro e NADA é substituído —
    // para trocar um documento, remove-se o antigo pela lixeira.
    const arquivos = form.getAll('file').filter((f): f is File => f instanceof File)
    const empresa = (form.get('empresa') as string | null)?.trim() || ''
    const competencia = (form.get('competencia') as string | null)?.trim() || '' // yyyy-mm-01

    if (!empresa) return NextResponse.json({ error: 'Escolha a empresa.' }, { status: 400 })
    if (!/^\d{4}-\d{2}-01$/.test(competencia)) {
      return NextResponse.json({ error: 'Informe o período (mês e ano).' }, { status: 400 })
    }
    if (arquivos.length === 0) {
      return NextResponse.json({ error: 'Anexe ao menos um arquivo PDF.' }, { status: 400 })
    }
    for (const file of arquivos) {
      if (file.type !== 'application/pdf') {
        return NextResponse.json({ error: `"${file.name}" não é PDF.` }, { status: 400 })
      }
      if (file.size > MAX_SIZE) {
        return NextResponse.json({ error: `"${file.name}" excede 25 MB.` }, { status: 400 })
      }
    }

    const supabase = await createSupabaseServiceClient()

    const enviados: string[] = []
    for (const file of arquivos) {
      const path = `${competencia.slice(0, 7)}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${file.name.replace(/[^\w.-]+/g, '_')}`
      const { error: upErr } = await supabase.storage
        .from(BUCKET).upload(path, await file.arrayBuffer(), { contentType: 'application/pdf', upsert: false })
      if (upErr) return NextResponse.json({ error: upErr.message, enviados: enviados.length }, { status: 500 })

      const { error } = await supabase.from('folhas_analiticas')
        .insert({ empresa, competencia, file_name: file.name, file_path: path })
      if (error) {
        await supabase.storage.from(BUCKET).remove([path]).catch(() => {})
        return NextResponse.json({ error: error.message, enviados: enviados.length }, { status: 400 })
      }
      enviados.push(file.name)
    }

    return NextResponse.json({ ok: true, enviados: enviados.length })
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
