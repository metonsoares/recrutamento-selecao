import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { decryptToken } from '@/lib/helpers'

const INVITE_MESSAGE =
  'Oi, vi que você cadastrou seu currículo na plataforma de recrutamento e seleção do Brownie do Ton. Em breve você será contatado.'

/** Garante o número no formato Z-API com DDI 55 (Brasil). */
function toZapiPhone(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '')
  if (!digits) return ''
  // 10 (fixo) ou 11 (celular) dígitos → sem DDI, prefixa 55
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createSupabaseServiceClient()

    const { data: candidate } = await supabase.from('candidates').select('id, full_name, phone').eq('id', id).maybeSingle()
    if (!candidate) return NextResponse.json({ ok: false, error: 'Candidato não encontrado.' }, { status: 404 })
    if (!candidate.phone) return NextResponse.json({ ok: false, error: 'Candidato sem telefone cadastrado.' }, { status: 400 })

    const phone = toZapiPhone(candidate.phone as string)
    if (!phone) return NextResponse.json({ ok: false, error: 'Telefone inválido.' }, { status: 400 })

    const { data: settings } = await supabase.from('whatsapp_settings').select('*').limit(1).single()
    if (!settings?.is_active) return NextResponse.json({ ok: false, error: 'Integração WhatsApp inativa.' }, { status: 400 })
    if (!settings?.instance_id || !settings?.instance_token_encrypted) {
      return NextResponse.json({ ok: false, error: 'Z-API não configurada.' }, { status: 400 })
    }

    const token = decryptToken(settings.instance_token_encrypted as string)
    const clientToken = decryptToken(settings.client_token_encrypted as string)
    const url = `${settings.api_base_url}/instances/${settings.instance_id}/token/${token}/send-text`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'client-token': clientToken },
      body: JSON.stringify({ phone, message: INVITE_MESSAGE }),
    })
    let data: Record<string, unknown> = {}
    try { data = await response.json() } catch { /* ignore */ }

    await supabase.from('whatsapp_logs').insert({
      direction: 'outbound', action: 'invite_interview', phone, message: INVITE_MESSAGE,
      status: response.ok ? 'sent' : 'error', response_payload: data,
    })

    if (!response.ok) {
      return NextResponse.json({ ok: false, error: (data?.error as string) || 'Falha ao enviar mensagem.' }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[invite-interview]', err)
    return NextResponse.json({ ok: false, error: 'Erro interno.' }, { status: 500 })
  }
}
