import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requireMasterApi } from '@/lib/auth-guard'

const MAX_SIZE = 15 * 1024 * 1024
const ALLOWED = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireMasterApi()
    if (denied) return denied
    const { id } = await params
    const formData = await req.formData()
    const name = (formData.get('name') as string | null)?.trim()
    const empresa = (formData.get('empresa') as string | null)?.trim() || null
    const file = formData.get('file') as File | null
    if (!name) return NextResponse.json({ error: 'Nome do template é obrigatório.' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()
    const update: Record<string, unknown> = { name, empresa }

    if (file && file.size > 0) {
      if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Arquivo excede 15 MB.' }, { status: 400 })
      if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: 'Envie PDF ou Word (.doc/.docx).' }, { status: 400 })
      const { data: old } = await supabase.from('contract_templates').select('file_path').eq('id', id).maybeSingle()
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
      const path = `contract-templates/${Date.now()}.${ext}`
      const bytes = await file.arrayBuffer()
      const { error: upErr } = await supabase.storage.from('admission-docs').upload(path, bytes, { contentType: file.type, upsert: false })
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
      const { data: urlData } = supabase.storage.from('admission-docs').getPublicUrl(path)
      update.file_url = urlData.publicUrl
      update.file_name = file.name
      update.file_path = path
      update.file_type = ext
      if (old?.file_path) { try { await supabase.storage.from('admission-docs').remove([old.file_path]) } catch { /* ignora */ } }
    }

    const { data, error } = await supabase.from('contract_templates').update(update).eq('id', id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ template: data })
  } catch (err) {
    console.error('[contract-templates PUT]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireMasterApi()
    if (denied) return denied
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
