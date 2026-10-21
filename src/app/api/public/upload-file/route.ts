import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

const BUCKET = 'candidatos-arquivos'

/**
 * 5 MB — o MESMO valor do `file_size_limit` do bucket `candidatos-arquivos`.
 *
 * Os dois números precisam andar juntos: é o BUCKET quem recusa de verdade, e
 * um limite maior aqui só adia a rejeição para um 500 sem explicação. Foi
 * assim que um candidato ficou impedido de se cadastrar em 20/10/2026 — esta
 * rota aceitava 5 MB e o bucket cortava em 2 MiB.
 *
 * A folga é intencional: o formulário comprime a foto mirando 2 MB (a média
 * real no banco é 306 KB), e os 5 MB cobrem o caso raro em que o navegador não
 * consegue abrir a imagem para comprimir. Antes de mexer neste número, mudar o
 * bucket — nunca só aqui.
 */
const MAX_SIZE = 5 * 1024 * 1024

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
      // A mensagem diz o que fazer: quem está com o celular na mão precisa de
      // uma saída, não de um número.
      return NextResponse.json(
        {
          error: isPDF
            ? 'O PDF passa de 5 MB. Envie uma versão mais leve ou mande uma foto das páginas.'
            : 'A imagem passa de 5 MB mesmo depois de reduzida. Tire a foto novamente, mais de perto.',
        },
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

    // `path` vai junto para quem gravar o registro poder guardar o caminho
    // interno; a URL segue sendo devolvida porque é o que as telas já usam
    // (e dela mesma se extrai o caminho — ver src/lib/arquivo-url.ts).
    return NextResponse.json({ url: publicUrl, path, filename: file.name })
  } catch (err) {
    console.error('[upload-file]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
