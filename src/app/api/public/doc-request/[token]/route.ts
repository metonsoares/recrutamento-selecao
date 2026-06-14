import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

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

/** POST — recebe o arquivo do funcionário, salva e injeta na ficha (admission_form). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const supabase = await createSupabaseServiceClient()

    const { data: dr } = await supabase
      .from('doc_requests')
      .select('id, candidate_id, application_id, doc_key, doc_label, status')
      .eq('token', token).maybeSingle()
    if (!dr) return NextResponse.json({ error: 'Solicitação inválida ou expirada.' }, { status: 404 })

    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 })

    const type = resolveType(file)
    if (!ALLOWED.includes(type)) {
      return NextResponse.json({ error: 'Formato inválido. Envie uma foto (JPG/PNG) ou PDF.' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Arquivo excede o limite de 15 MB.' }, { status: 400 })
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || (type === 'application/pdf' ? 'pdf' : 'jpg')
    const ts = Date.now()
    const path = `${dr.candidate_id}/${dr.doc_key}/${ts}.${ext}`
    const bytes = await file.arrayBuffer()

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: false })
    if (upErr) {
      console.error('[doc-request upload]', upErr)
      return NextResponse.json({ error: 'Falha ao salvar o arquivo. Tente novamente.' }, { status: 500 })
    }
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
    const uploadedFile = { url: urlData.publicUrl, name: file.name, path }

    // ── Injeta o arquivo na ficha (applications.admission_form.docs[doc_key]) ──
    let applicationId = dr.application_id as string | null
    if (!applicationId) {
      const { data: app } = await supabase
        .from('applications').select('id').eq('candidate_id', dr.candidate_id).eq('is_latest', true).maybeSingle()
      applicationId = app?.id ?? null
    }
    if (applicationId) {
      const { data: appRow } = await supabase.from('applications').select('admission_form').eq('id', applicationId).maybeSingle()
      const formData = (appRow?.admission_form as Record<string, unknown> | null) || {}
      const docs = (formData.docs as Record<string, { not_applicable?: boolean; files?: unknown[] }> | undefined) || {}
      const current = docs[dr.doc_key] || { not_applicable: false, files: [] }
      const files = Array.isArray(current.files) ? current.files : []
      docs[dr.doc_key] = { not_applicable: false, files: [...files, uploadedFile] }
      const newForm = { ...formData, docs }
      await supabase.from('applications').update({ admission_form: newForm, updated_at: new Date().toISOString() }).eq('id', applicationId)
    }

    await supabase.from('doc_requests').update({
      status: 'enviado', uploaded_file: uploadedFile, application_id: applicationId, updated_at: new Date().toISOString(),
    }).eq('id', dr.id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[doc-request POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
