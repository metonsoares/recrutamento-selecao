import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

const MAX_SIZE = 4 * 1024 * 1024 // 4 MB
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png']

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: candidateId } = await params
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const docKey = formData.get('docKey') as string | null

    if (!file || !docKey) {
      return NextResponse.json({ error: 'Arquivo e docKey são obrigatórios.' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Arquivo excede o limite de 4 MB.' }, { status: 400 })
    }
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json({ error: 'Formato inválido. Use PDF, JPG ou PNG.' }, { status: 400 })
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
    const ts = Date.now()
    const path = `${candidateId}/${docKey}/${ts}.${ext}`

    const supabase = await createSupabaseServiceClient()
    const bytes = await file.arrayBuffer()

    const { error: uploadError } = await supabase
      .storage
      .from('admission-docs')
      .upload(path, bytes, { contentType: file.type, upsert: false })

    if (uploadError) {
      console.error('[admission-docs upload]', uploadError)
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const { data: urlData } = supabase.storage.from('admission-docs').getPublicUrl(path)

    return NextResponse.json({ url: urlData.publicUrl, name: file.name, path })
  } catch (err) {
    console.error('[admission-docs POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await params
    const { path } = await req.json()
    if (!path) return NextResponse.json({ error: 'path obrigatório.' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()
    const { error } = await supabase.storage.from('admission-docs').remove([path])
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[admission-docs DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
