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

/**
 * Tipos que o BUCKET aceita (`allowed_mime_types`). Conferir aqui é o que
 * transforma "Erro ao fazer upload. Tente novamente." — que faria o candidato
 * tentar a vida toda — em uma instrução do que mandar.
 */
const TIPOS_DO_BUCKET = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']

/** Detect MIME type from file extension when browser sends empty type (common on Android camera) */
function resolveType(nome: string, tipo: string): string {
  if (tipo && tipo !== 'application/octet-stream') return tipo
  const ext = nome.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
    heic: 'image/heic', heif: 'image/heif',
    pdf: 'application/pdf',
  }
  return map[ext] || tipo || 'application/octet-stream'
}

/** Erro de validação comum aos dois caminhos — ou `null` quando está tudo certo. */
function recusa(nome: string, tipo: string, tamanho: number): string | null {
  const isPDF = tipo === 'application/pdf'
  if (!tipo.startsWith('image/') && !isPDF) {
    return 'Tipo não permitido. Envie PDF, JPG ou PNG.'
  }
  if (tamanho <= 0) return 'O arquivo está vazio.'
  if (tamanho > MAX_SIZE) {
    // A mensagem diz o que fazer: quem está com o celular na mão precisa de
    // uma saída, não de um número.
    return isPDF
      ? 'O PDF passa de 5 MB. Envie uma versão mais leve ou mande uma foto das páginas.'
      : 'A imagem passa de 5 MB mesmo depois de reduzida. Tire a foto novamente, mais de perto.'
  }
  if (!TIPOS_DO_BUCKET.includes(tipo)) {
    return `Não conseguimos aceitar "${nome}". Envie a foto em JPG ou PNG, ou o arquivo em PDF.`
  }
  return null
}

function nomeDoObjeto(nome: string): string {
  const ext = nome.split('.').pop()?.toLowerCase() || 'jpg'
  return `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
}

/**
 * POST /api/public/upload-file
 *
 * Caminho novo (JSON): não recebe o arquivo — devolve uma AUTORIZAÇÃO de
 * upload (`signedUrl` + `token`) para o navegador mandar o arquivo direto ao
 * Supabase Storage.
 *
 * Por quê: a Vercel corta o corpo de qualquer função em ~4,5 MB
 * (FUNCTION_PAYLOAD_TOO_LARGE). Medido no ar em 23/10/2026: 1 MB passa, 4,4 MB
 * já volta 413. Ou seja, os 5 MB prometidos ao candidato nunca chegavam —
 * entre ~4,4 e 5 MB ele levava um erro cru e desistia do cadastro. Mesmo
 * remédio dos anexos das Observações Internas.
 *
 * Caminho antigo (multipart) continua aceito de propósito: quem está com o
 * formulário aberto desde antes desta publicação ainda roda o código velho, e
 * perder um currículo pela metade é pior do que o limite menor desse caminho.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServiceClient()
    const contentType = req.headers.get('content-type') || ''

    // ── Caminho antigo: o arquivo vem no corpo ────────────────────────────────
    if (!contentType.includes('application/json')) {
      const formData = await req.formData()
      const file = formData.get('file') as File | null
      if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 })

      const tipo = resolveType(file.name, file.type)
      const erro = recusa(file.name, tipo, file.size)
      if (erro) return NextResponse.json({ error: erro }, { status: 400 })

      const path = nomeDoObjeto(file.name)
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, await file.arrayBuffer(), { contentType: tipo, upsert: false })

      if (uploadError) {
        console.error('[upload-file] storage error:', uploadError)
        return NextResponse.json({ error: 'Erro ao fazer upload. Tente novamente.' }, { status: 500 })
      }

      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)
      return NextResponse.json({ url: publicUrl, path, filename: file.name })
    }

    // ── Caminho novo: só a autorização ────────────────────────────────────────
    const { name, type, size } = await req.json().catch(() => ({})) as {
      name?: string; type?: string; size?: number
    }

    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Arquivo sem nome.' }, { status: 400 })
    }
    if (typeof size !== 'number' || !Number.isFinite(size)) {
      return NextResponse.json({ error: 'Arquivo inválido.' }, { status: 400 })
    }

    const tipo = resolveType(name, typeof type === 'string' ? type : '')
    const erro = recusa(name, tipo, size)
    if (erro) return NextResponse.json({ error: erro }, { status: 400 })

    // O caminho é decidido AQUI: o navegador manda o arquivo, não escolhe onde
    // ele cai. O token vale para este objeto e só para ele.
    const path = nomeDoObjeto(name)
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)

    if (error || !data?.signedUrl || !data?.token) {
      console.error('[upload-file] sign error:', error)
      return NextResponse.json({ error: 'Não foi possível preparar o envio. Tente novamente.' }, { status: 500 })
    }

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)

    // `url` é a MESMA de antes: é dela que as telas do painel extraem o caminho
    // do arquivo (ver src/lib/arquivo-url.ts), e é ela que vai na resposta do
    // candidato. O formulário só a usa depois que o upload termina.
    return NextResponse.json({
      signedUrl: data.signedUrl,
      token: data.token,
      bucket: BUCKET,
      path,
      url: publicUrl,
      filename: name,
      contentType: tipo,
    })
  } catch (err) {
    console.error('[upload-file]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
