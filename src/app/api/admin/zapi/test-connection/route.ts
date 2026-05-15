import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { decryptToken } from '@/lib/helpers'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServiceClient()
    const { data: settings } = await supabase.from('whatsapp_settings').select('*').limit(1).single()

    if (!settings?.instance_id || !settings?.instance_token_encrypted) {
      return NextResponse.json({ ok: false, error: 'Credenciais não configuradas' }, { status: 400 })
    }

    const token = decryptToken(settings.instance_token_encrypted)
    const clientToken = decryptToken(settings.client_token_encrypted)

    const url = `${settings.api_base_url}/instances/${settings.instance_id}/token/${token}/status`
    const response = await fetch(url, {
      headers: { 'client-token': clientToken },
    })
    const data = await response.json()

    await supabase.from('whatsapp_settings').update({ last_connection_at: new Date().toISOString() }).eq('id', settings.id)

    return NextResponse.json({ ok: response.ok, data })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
