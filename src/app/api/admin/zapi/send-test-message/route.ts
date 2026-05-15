import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { decryptToken } from '@/lib/helpers'

export async function POST(req: NextRequest) {
  try {
    const { phone, message } = await req.json()
    const supabase = await createSupabaseServiceClient()
    const { data: settings } = await supabase.from('whatsapp_settings').select('*').limit(1).single()

    if (!settings?.instance_id || !settings?.instance_token_encrypted) {
      return NextResponse.json({ ok: false, error: 'Z-API não configurada' }, { status: 400 })
    }

    const token = decryptToken(settings.instance_token_encrypted)
    const clientToken = decryptToken(settings.client_token_encrypted)
    const url = `${settings.api_base_url}/instances/${settings.instance_id}/token/${token}/send-text`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'client-token': clientToken },
      body: JSON.stringify({ phone, message }),
    })
    const data = await response.json()

    await supabase.from('whatsapp_logs').insert({
      direction: 'outbound', action: 'test_message', phone, message,
      status: response.ok ? 'sent' : 'error',
      response_payload: data,
    })
    await supabase.from('whatsapp_settings').update({ last_test_sent_at: new Date().toISOString() }).eq('id', settings.id)

    return NextResponse.json({ ok: response.ok, data })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
