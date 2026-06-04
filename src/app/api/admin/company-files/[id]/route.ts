import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

const MAX_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword']

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const formData = await req.formData()
    const name = (formData.get('name') as string | null)?.trim()
    const category = (formData.get('category') as string | null)?.trim() || null
    const empresa = (formData.get('empresa') as string | null)?.trim() || null
    const noExpiry = formData.get('no_expiry') === 'true'
    const expiresAt = noExpiry ? null : ((formData.get('expires_at') as string | null)?.trim() || null)
    const file = formData.get('file') as File | null

    if (!name) return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()
    const update: Record<string, unknown> = { name, category, empresa, expires_at: expiresAt, no_expiry: noExpiry }

    // Substituição opcional do arquivo
    if (file && file.size > 0) {
      if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Arquivo excede 10 MB.' }, { status: 400 })
      if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: 'Formato inválido. Use PDF, DOC, JPG ou PNG.' }, { status: 400 })

      const { data: old } = await supabase.from('company_files').select('file_path').eq('id', id).maybeSingle()
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
      const ts = Date.now()
      const path = `company-files/${ts}.${ext}`
      const bytes = await file.arrayBuffer()
      const { error: upErr } = await supabase.storage.from('admission-docs').upload(path, bytes, { contentType: file.type, upsert: false })
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
      const { data: urlData } = supabase.storage.from('admission-docs').getPublicUrl(path)
      update.file_url = urlData.publicUrl
      update.file_name = file.name
      update.file_path = path
      if (old?.file_path) { try { await supabase.storage.from('admission-docs').remove([old.file_path]) } catch { /* ignora */ } }
    }

    const { data, error } = await supabase.from('company_files').update(update).eq('id', id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ file: data })
  } catch (err) {
    console.error('[company-files PUT]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createSupabaseServiceClient()
    const { data: f } = await supabase.from('company_files').select('file_path').eq('id', id).maybeSingle()
    if (f?.file_path) await supabase.storage.from('admission-docs').remove([f.file_path]).catch(() => {})
    const { error } = await supabase.from('company_files').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[company-files DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
