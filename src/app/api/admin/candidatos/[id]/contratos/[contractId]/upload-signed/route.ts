import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

export const maxDuration = 30

const MAX_SIZE = 15 * 1024 * 1024
const ALLOWED = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]

/**
 * POST — anexa manualmente um arquivo (ex.: contrato já assinado) ao contrato,
 * marcando-o como assinado. Usado como alternativa ao envio para assinatura D4Sign.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; contractId: string }> }) {
  try {
    const auth = await createSupabaseServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

    const { id, contractId } = await params
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 })
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Arquivo excede o limite de 15 MB.' }, { status: 400 })
    if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: 'Formato inválido. Use PDF, JPG, PNG ou Word.' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()
    const { data: contract } = await supabase
      .from('freelancer_contracts').select('id').eq('id', contractId).eq('candidate_id', id).maybeSingle()
    if (!contract) return NextResponse.json({ error: 'Contrato não encontrado.' }, { status: 404 })

    const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf'
    const ts = Date.now()
    const path = `${id}/contrato-assinado/${contractId}/${ts}.${ext}`
    const bytes = await file.arrayBuffer()
    const { error: upErr } = await supabase.storage.from('admission-docs').upload(path, bytes, { contentType: file.type, upsert: false })
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
    const { data: urlData } = supabase.storage.from('admission-docs').getPublicUrl(path)

    const now = new Date().toISOString()
    await supabase.from('freelancer_contracts').update({
      signed_file_url: urlData.publicUrl,
      d4sign_status: 'assinado',
      d4sign_status_raw: 'Arquivo anexado manualmente',
      d4sign_signed_at: now,
    }).eq('id', contractId)

    return NextResponse.json({ ok: true, signed_file_url: urlData.publicUrl })
  } catch (err) {
    console.error('[contrato upload-signed]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
