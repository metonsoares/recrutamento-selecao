/**
 * Shared WhatsApp / Z-API utility.
 * Loads settings from the DB and sends a message via Z-API.
 */
import { decryptToken } from './helpers'
import { createSupabaseServiceClient } from './supabase-server'

/** Garante o número no formato Z-API com DDI 55 (Brasil). */
export function toZapiPhone(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}

/**
 * Envia uma mensagem de texto para um telefone "cru" (normaliza DDI 55).
 * Retorna { ok, error? }. Registra em whatsapp_logs com a `action` informada.
 */
export async function sendWhatsAppRaw(
  rawPhone: string,
  message: string,
  action = 'system_message',
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createSupabaseServiceClient()
  const phone = toZapiPhone(rawPhone)
  if (!phone) return { ok: false, error: 'Telefone inválido.' }

  const { data: settings } = await supabase.from('whatsapp_settings').select('*').limit(1).single()
  if (!settings?.is_active) return { ok: false, error: 'Integração WhatsApp inativa.' }
  if (!settings?.instance_id || !settings?.instance_token_encrypted) return { ok: false, error: 'Z-API não configurada.' }

  try {
    const token = decryptToken(settings.instance_token_encrypted as string)
    const clientToken = decryptToken(settings.client_token_encrypted as string)
    const url = `${settings.api_base_url}/instances/${settings.instance_id}/token/${token}/send-text`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'client-token': clientToken },
      body: JSON.stringify({ phone, message }),
    })
    let data: Record<string, unknown> = {}
    try { data = await response.json() } catch { /* ignore */ }
    await supabase.from('whatsapp_logs').insert({
      direction: 'outbound', action, phone, message,
      status: response.ok ? 'sent' : 'error', response_payload: data,
    })
    if (!response.ok) return { ok: false, error: (data?.error as string) || 'Falha ao enviar mensagem.' }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

/**
 * Send a WhatsApp message to `phone` via Z-API.
 * If `conversationId` is provided the outbound message is logged to whatsapp_messages.
 * Returns true when Z-API accepted the request.
 */
export async function sendWhatsAppMessage(
  phone: string,
  message: string,
  conversationId?: string | null,
): Promise<boolean> {
  const supabase = await createSupabaseServiceClient()

  const { data: settings } = await supabase
    .from('whatsapp_settings')
    .select('*')
    .limit(1)
    .single()

  if (!settings?.is_active || !settings?.instance_id) return false

  try {
    const token = decryptToken(settings.instance_token_encrypted as string)
    const clientToken = decryptToken(settings.client_token_encrypted as string)
    const url = `${settings.api_base_url}/instances/${settings.instance_id}/token/${token}/send-text`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'client-token': clientToken },
      body: JSON.stringify({ phone, message, delayMessage: 3, delayTyping: 2 }),
    })

    let responseData: Record<string, unknown> = {}
    try { responseData = await response.json() } catch { /* ignore */ }

    if (conversationId) {
      await supabase.from('whatsapp_messages').insert({
        conversation_id: conversationId,
        direction: 'outbound',
        message_text: message,
        raw_payload: { phone, zapi_status: response.status, zapi_response: responseData },
        zapi_message_id: (responseData?.zaapId as string) || null,
      })
    }

    return response.ok
  } catch {
    return false
  }
}
