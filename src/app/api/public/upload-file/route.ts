import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

const MAX_SIZE = 5 * 1024 * 1024 // 5 MB (client compresses large images before upload)
const BUCKET = 'candidatos-arquivos'

/** Detect MIME type from file extension when browser sends empty type (common on Android camera) */
function resolveType(file: File): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
    heic: 'image/heic', heif: 'image/heif',
    pdf: 'application/pdf',
  }
  return map[ext] || file.type || 'application/octet-stream'
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 })
    }

    const effectiveType = resolveType(file)
    const isImage = effectiveType.startsWith('image/')
    const isPDF = effectiveType === 'application/pdf'

    if (!isImage && !isPDF) {
      return NextResponse.json(
        { error: 'Tipo não permitido. Envie PDF, JPG, PNG ou outra imagem.' },
        { status: 400 },
      )
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'Arquivo muito grande. Tamanho máximo: 5 MB.' },
        { status: 400 },
      )
    }

    const supabase = await createSupabaseServiceClient()

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const path = `uploads/${uniqueName}`

    const buffer = await file.arrayBuffer()

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: effectiveType,
        upsert: false,
      })

    if (uploadError) {
      console.error('[upload-file] storage error:', uploadError)
      return NextResponse.json({ error: 'Erro ao fazer upload. Tente novamente.' }, { status: 500 })
    }

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)

    return NextResponse.json({ url: publicUrl, filename: file.name })
  } catch (err) {
    console.error('[upload-file]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
