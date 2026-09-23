import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { docsPendentesFicha, FICHA_DOCS, FichaComDocs } from '@/lib/doc-pendency'

const MAX_SIZE = 15 * 1024 * 1024 // 15 MB
const BUCKET = 'admission-docs'

/** Detecta o MIME pela extensão quando o navegador não envia (câmera Android/iPhone). */
function resolveType(file: File): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    heic: 'image/heic', heif: 'image/heif', pdf: 'application/pdf',
  }
  return map[ext] || file.type || 'application/octet-stream'
}

const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

/**
 * POST — recebe um arquivo do colaborador pelo link externo e injeta na ficha.
 *
 * Só aceita documento que está PENDENTE agora: o token não vira uma porta para
 * escrever qualquer coisa na ficha, e reenvio do que já foi entregue é recusado.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const supabase = await createSupabaseServiceClient()

    const { data: portal } = await supabase
      .from('doc_portals').select('id, candidate_id, revoked_at')
      .eq('token', token).maybeSingle()
    if (!portal || portal.revoked_at) {
      return NextResponse.json({ error: 'Link inválido ou expirado.' }, { status: 404 })
    }

    const form = await req.formData()
    const file = form.get('file') as File | null
    const docKey = String(form.get('doc_key') ?? '')
    if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 })
    if (!FICHA_DOCS.some(d => d.key === docKey)) {
      return NextResponse.json({ error: 'Documento desconhecido.' }, { status: 400 })
    }

    const type = resolveType(file)
    if (!ALLOWED.includes(type)) {
      return NextResponse.json({ error: 'Formato inválido. Envie uma foto (JPG/PNG) ou PDF.' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Arquivo excede o limite de 15 MB.' }, { status: 400 })
    }

    const { data: app } = await supabase
      .from('applications').select('id, admission_form')
      .eq('candidate_id', portal.candidate_id as string).eq('is_latest', true).maybeSingle()
    if (!app?.id) return NextResponse.json({ error: 'Ficha não encontrada.' }, { status: 404 })

    const ficha = (app.admission_form as FichaComDocs) ?? null
    if (!docsPendentesFicha(ficha).some(d => d.key === docKey)) {
      return NextResponse.json({ error: 'Este documento já foi entregue.' }, { status: 409 })
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || (type === 'application/pdf' ? 'pdf' : 'jpg')
    const path = `${portal.candidate_id}/${docKey}/${Date.now()}.${ext}`
    const bytes = await file.arrayBuffer()

    const { error: upErr } = await supabase.storage.from(BUCKET)
      .upload(path, bytes, { contentType: type, upsert: false })
    if (upErr) {
      console.error('[doc-portal upload]', upErr)
      return NextResponse.json({ error: 'Falha ao salvar o arquivo. Tente novamente.' }, { status: 500 })
    }
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
    const arquivo = { url: urlData.publicUrl, name: file.name, path }

    // Injeta na ficha, no mesmo lugar em que o RH anexa pela tela.
    const formData = (ficha ?? {}) as Record<string, unknown>
    const docs = (formData.docs as Record<string, { not_applicable?: boolean; files?: unknown[] }>) ?? {}
    const atual = docs[docKey] ?? { not_applicable: false, files: [] }
    const files = Array.isArray(atual.files) ? atual.files : []
    const novaFicha = { ...formData, docs: { ...docs, [docKey]: { not_applicable: false, files: [...files, arquivo] } } }

    const agora = new Date().toISOString()
    const { error } = await supabase.from('applications')
      .update({ admission_form: novaFicha, updated_at: agora }).eq('id', app.id as string)
    if (error) return NextResponse.json({ error: 'Não consegui registrar o envio.' }, { status: 500 })

    await supabase.from('doc_portals')
      .update({ last_upload_at: agora, updated_at: agora, application_id: app.id })
      .eq('id', portal.id as string)

    return NextResponse.json({ ok: true, pendentes: docsPendentesFicha(novaFicha as FichaComDocs) })
  } catch (err) {
    console.error('[doc-portal POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
