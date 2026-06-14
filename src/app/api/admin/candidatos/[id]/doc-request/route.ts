import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { generateToken, generateShortCode, publicAppUrl } from '@/lib/helpers'
import { sendWhatsAppRaw } from '@/lib/whatsapp'

/**
 * POST /api/admin/candidatos/[id]/doc-request
 * Cria (ou reaproveita) uma solicitação de documento pendente e envia ao
 * funcionário um WhatsApp com o link para anexar o arquivo.
 * Body: { doc_key, doc_label }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await createSupabaseServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

    const { id } = await params
    const { doc_key, doc_label } = await req.json()
    if (!doc_key || !doc_label) return NextResponse.json({ error: 'Documento inválido.' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()

    const { data: candidate } = await supabase
      .from('candidates').select('id, full_name, phone').eq('id', id).maybeSingle()
    if (!candidate) return NextResponse.json({ error: 'Funcionário não encontrado.' }, { status: 404 })
    if (!candidate.phone) return NextResponse.json({ error: 'Funcionário sem telefone cadastrado.' }, { status: 400 })

    // Candidatura mais recente (onde fica a ficha/admission_form)
    const { data: app } = await supabase
      .from('applications').select('id').eq('candidate_id', id).eq('is_latest', true).maybeSingle()

    // Reaproveita solicitação pendente existente para o mesmo documento (mesmo link)
    const { data: existing } = await supabase
      .from('doc_requests')
      .select('id, token, short_code')
      .eq('candidate_id', id).eq('doc_key', doc_key).eq('status', 'pendente')
      .maybeSingle()

    let token = existing?.token as string | undefined
    let shortCode = existing?.short_code as string | undefined
    const requestedAt = new Date().toISOString()

    if (existing) {
      await supabase.from('doc_requests').update({
        doc_label, application_id: app?.id ?? null, last_requested_at: requestedAt, updated_at: requestedAt,
      }).eq('id', existing.id)
    } else {
      token = generateToken()
      shortCode = generateShortCode()
      const { error } = await supabase.from('doc_requests').insert({
        token, short_code: shortCode, candidate_id: id, application_id: app?.id ?? null,
        doc_key, doc_label, status: 'pendente', last_requested_at: requestedAt,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const link = `${publicAppUrl()}/d/${shortCode}`
    const firstName = String(candidate.full_name).split(' ')[0]
    const message =
      `Olá ${firstName}! 👋\n\n` +
      `Identificamos que o seguinte documento está *pendente* no seu cadastro:\n\n` +
      `📄 *${doc_label}*\n\n` +
      `Por favor, envie o arquivo (foto ou PDF) pelo link abaixo:\n${link}\n\n` +
      `Assim que enviar, ele será adicionado automaticamente à sua ficha. Obrigado!`

    const sent = await sendWhatsAppRaw(candidate.phone as string, message, 'doc_request')
    if (!sent.ok) {
      return NextResponse.json({ error: `Falha ao enviar WhatsApp: ${sent.error}`, link }, { status: 502 })
    }

    return NextResponse.json({ ok: true, link, last_requested_at: requestedAt })
  } catch (err) {
    console.error('[doc-request]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
