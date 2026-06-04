import { NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { decryptToken } from '@/lib/helpers'

export const maxDuration = 30

function appBaseUrl(): string {
  const u = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
  return u.replace(/\/$/, '')
}

export async function POST() {
  try {
    const supabase = await createSupabaseServiceClient()
    const { data: settings } = await supabase.from('whatsapp_settings').select('*').limit(1).single()
    if (!settings?.instance_id || !settings?.instance_token_encrypted) {
      return NextResponse.json({ ok: false, error: 'Credenciais não configuradas.' }, { status: 400 })
    }

    const base = appBaseUrl()
    if (!base) return NextResponse.json({ ok: false, error: 'APP_URL não configurada no servidor.' }, { status: 500 })

    const token = decryptToken(settings.instance_token_encrypted as string)
    const clientToken = decryptToken(settings.client_token_encrypted as string)
    const apiBase = (settings.api_base_url as string) || 'https://api.z-api.io'
    const root = `${apiBase}/instances/${settings.instance_id}/token/${token}`

    const receivedUrl = `${base}/api/webhooks/zapi/received`
    const statusUrl = `${base}/api/webhooks/zapi/message-status`
    const deliveredUrl = `${base}/api/webhooks/zapi/delivered`
    const disconnectedUrl = `${base}/api/webhooks/zapi/disconnected`

    const targets: { key: string; endpoint: string; url: string }[] = [
      { key: 'received', endpoint: 'update-webhook-received', url: receivedUrl },
      { key: 'message-status', endpoint: 'update-webhook-message-status', url: statusUrl },
      { key: 'delivered', endpoint: 'update-webhook-delivery', url: deliveredUrl },
      { key: 'disconnected', endpoint: 'update-webhook-disconnected', url: disconnectedUrl },
    ]

    const results: { key: string; ok: boolean; status: number; error?: string }[] = []
    for (const t of targets) {
      try {
        const res = await fetch(`${root}/${t.endpoint}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'client-token': clientToken },
          body: JSON.stringify({ value: t.url }),
        })
        let detail = ''
        if (!res.ok) { try { detail = JSON.stringify(await res.json()) } catch { detail = await res.text().catch(() => '') } }
        results.push({ key: t.key, ok: res.ok, status: res.status, error: res.ok ? undefined : detail })
      } catch (e) {
        results.push({ key: t.key, ok: false, status: 0, error: String(e) })
      }
    }

    // Persiste as URLs registradas (as que tiveram sucesso)
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (results.find(r => r.key === 'received')?.ok) update.webhook_received_url = receivedUrl
    if (results.find(r => r.key === 'message-status')?.ok) update.webhook_message_status_url = statusUrl
    if (results.find(r => r.key === 'disconnected')?.ok) update.webhook_disconnected_url = disconnectedUrl
    await supabase.from('whatsapp_settings').update(update).eq('id', settings.id)

    const allOk = results.every(r => r.ok)
    const receivedOk = results.find(r => r.key === 'received')?.ok
    return NextResponse.json({ ok: !!receivedOk, allOk, results, base })
  } catch (err) {
    console.error('[zapi register-webhooks]', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
