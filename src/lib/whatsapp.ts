/**
 * Shared WhatsApp / Z-API utility.
 * Loads settings from the DB and sends a message via Z-API.
 */
import { decryptToken } from './helpers'
import { createSupabaseServiceClient } from './supabase-server'

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
