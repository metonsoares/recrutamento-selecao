import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { getD4SignCreds, getDocument, isSigned, getSignedFileUrl, listSignatures, signersProgress } from '@/lib/d4sign'

export const dynamic = 'force-dynamic'

/**
 * Receptor do webhook (POSTBack) da D4Sign.
 * É público (D4Sign chama sem nossa autenticação). Usamos o POSTBack apenas
 * como gatilho: identificamos o documento pelo uuid e RECONSULTAMOS a API da
 * D4Sign (autenticada) para obter o status real e atualizar a ficha.
 */

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

async function extractUuid(req: NextRequest): Promise<string | null> {
  const ct = req.headers.get('content-type') || ''
  try {
    if (ct.includes('application/json')) {
      const body = await req.json().catch(() => null)
      if (body) {
        const v = (body.uuid || body.uuidDoc || body.uuid_document || body.document || body.uuid_doc)
        if (typeof v === 'string' && UUID_RE.test(v)) return v.match(UUID_RE)![0]
        const m = JSON.stringify(body).match(UUID_RE)
        if (m) return m[0]
      }
    } else {
      // form-urlencoded / multipart / texto
      const text = await req.text()
      const params = new URLSearchParams(text)
      for (const key of ['uuid', 'uuidDoc', 'uuid_document', 'document', 'uuid_doc']) {
        const v = params.get(key)
        if (v && UUID_RE.test(v)) return v.match(UUID_RE)![0]
      }
      const m = text.match(UUID_RE)
      if (m) return m[0]
    }
  } catch { /* ignora */ }
  return null
}

export async function POST(req: NextRequest) {
  try {
    const uuid = await extractUuid(req)
    if (!uuid) return NextResponse.json({ ok: true, ignored: 'sem uuid' })

    const supabase = await createSupabaseServiceClient()
    const { data: contract } = await supabase
      .from('freelancer_contracts').select('id, candidate_id, signed_file_url').eq('d4sign_uuid', uuid).maybeSingle()
    if (!contract) return NextResponse.json({ ok: true, ignored: 'documento não vinculado' })

    const creds = await getD4SignCreds()
    if (!creds) return NextResponse.json({ ok: true, ignored: 'd4sign desconectada' })

    const doc = await getDocument(creds, uuid)
    if (!doc.ok) return NextResponse.json({ ok: true, ignored: 'falha ao consultar documento' })

    const signers = await listSignatures(creds, uuid)
    const anySigned = !!signers && signers.some(s => s.signed)
    const { data: cand } = await supabase.from('candidates').select('email').eq('id', contract.candidate_id as string).maybeSingle()
    const progress = signersProgress(signers, creds.accountEmail, (cand?.email as string | null) || '')
    const baseRaw = String((doc.doc?.statusName ?? doc.doc?.status_name ?? doc.doc?.status ?? '')) || 'Aguardando assinaturas'

    // Basta UMA assinatura para considerar assinado (ou documento finalizado)
    if (isSigned(doc.doc) || anySigned) {
      let url = (contract.signed_file_url as string | null) || null
      if (!url) url = await getSignedFileUrl(creds, uuid)
      await supabase.from('freelancer_contracts').update({
        d4sign_status: 'assinado', d4sign_status_raw: progress || 'Assinado', signed_file_url: url,
        d4sign_signed_at: new Date().toISOString(),
      }).eq('id', contract.id)
      return NextResponse.json({ ok: true, status: 'assinado' })
    }

    await supabase.from('freelancer_contracts').update({ d4sign_status: 'enviado', d4sign_status_raw: progress || baseRaw }).eq('id', contract.id)
    return NextResponse.json({ ok: true, status: 'enviado' })
  } catch (err) {
    console.error('[webhook d4sign]', err)
    // Sempre 200 para a D4Sign não reenviar em loop por erro nosso.
    return NextResponse.json({ ok: true })
  }
}

/** GET — verificação simples (a D4Sign pode validar a URL). */
export async function GET() {
  return NextResponse.json({ ok: true, service: 'd4sign-webhook' })
}
