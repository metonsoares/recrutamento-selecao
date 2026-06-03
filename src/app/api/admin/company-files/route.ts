import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

const MAX_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword']

export async function GET() {
  try {
    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('company_files')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ files: data })
  } catch (err) {
    console.error('[company-files GET]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const name = (formData.get('name') as string | null)?.trim()
    const category = (formData.get('category') as string | null)?.trim() || null
    const empresa = (formData.get('empresa') as string | null)?.trim() || null
    const noExpiry = formData.get('no_expiry') === 'true'
    const expiresAt = noExpiry ? null : ((formData.get('expires_at') as string | null)?.trim() || null)

    if (!name) return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })
    if (!file) return NextResponse.json({ error: 'Arquivo é obrigatório.' }, { status: 400 })
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Arquivo excede 10 MB.' }, { status: 400 })
    if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: 'Formato inválido. Use PDF, DOC, JPG ou PNG.' }, { status: 400 })

    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
    const ts = Date.now()
    const path = `company-files/${ts}.${ext}`

    const supabase = await createSupabaseServiceClient()
    const bytes = await file.arrayBuffer()
    const { error: upErr } = await supabase.storage.from('admission-docs').upload(path, bytes, { contentType: file.type, upsert: false })
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    const { data: urlData } = supabase.storage.from('admission-docs').getPublicUrl(path)

    const { data, error } = await supabase
      .from('company_files')
      .insert({ name, category, empresa, expires_at: expiresAt, no_expiry: noExpiry, file_url: urlData.publicUrl, file_name: file.name, file_path: path })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ file: data })
  } catch (err) {
    console.error('[company-files POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
