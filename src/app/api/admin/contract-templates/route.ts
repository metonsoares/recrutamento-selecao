import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requireMasterApi } from '@/lib/auth-guard'

const MAX_SIZE = 15 * 1024 * 1024 // 15 MB
const ALLOWED = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]

export async function GET() {
  try {
    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase.from('contract_templates').select('*').order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ templates: data })
  } catch (err) {
    console.error('[contract-templates GET]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireMasterApi()
    if (denied) return denied
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const name = (formData.get('name') as string | null)?.trim()
    const empresa = (formData.get('empresa') as string | null)?.trim() || null

    if (!name) return NextResponse.json({ error: 'Nome do template é obrigatório.' }, { status: 400 })
    if (!file) return NextResponse.json({ error: 'Arquivo é obrigatório.' }, { status: 400 })
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Arquivo excede 15 MB.' }, { status: 400 })
    if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: 'Envie um arquivo PDF ou Word (.doc/.docx).' }, { status: 400 })

    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
    const path = `contract-templates/${Date.now()}.${ext}`

    const supabase = await createSupabaseServiceClient()
    const bytes = await file.arrayBuffer()
    const { error: upErr } = await supabase.storage.from('admission-docs').upload(path, bytes, { contentType: file.type, upsert: false })
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
    const { data: urlData } = supabase.storage.from('admission-docs').getPublicUrl(path)

    const { data, error } = await supabase.from('contract_templates').insert({
      name, empresa, file_url: urlData.publicUrl, file_name: file.name, file_path: path, file_type: ext,
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ template: data })
  } catch (err) {
    console.error('[contract-templates POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
