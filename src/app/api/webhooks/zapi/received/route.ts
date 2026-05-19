import { NextRequest, NextResponse, after } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { normalizePhone, decryptToken } from '@/lib/helpers'

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServiceClient>>

// ─── Entry point — returns 200 immediately, processes in background ───────────

export async function POST(req: NextRequest) {
  let payload: Record<string, unknown> = {}
  try { payload = await req.json() } catch { /* ignore */ }

  // Return 200 to Z-API immediately (prevents retries / timeouts)
  after(async () => {
    try {
      await handleInbound(payload)
    } catch (err) {
      console.error('[webhook] unhandled error:', err)
    }
  })

  return NextResponse.json({ ok: true })
}

// ─── Main handler ─────────────────────────────────────────────────────────────

/**
 * Idle window: how long a conversation stays "active" before being auto-closed.
 * A new message after this window restarts the conversation (welcome again).
 */
const CONVERSATION_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

async function handleInbound(payload: Record<string, unknown>) {
  const supabase = await createSupabaseServiceClient()

  // Log raw payload
  await supabase.from('whatsapp_logs').insert({
    direction: 'inbound',
    action: 'webhook_received',
    phone: (payload?.phone || payload?.from || '') as string,
    message: (payload?.text as Record<string,string>)?.message || (payload?.message as string) || '',
    status: 'received',
    request_payload: payload,
  })

  // Ignore messages sent by the bot itself (avoids infinite loop)
  if (payload?.fromMe === true) return

  // Ignore group messages
  if (payload?.isGroup === true) return

  const phone = (payload?.phone || payload?.from || '') as string
  const messageText = ((payload?.text as Record<string,string>)?.message || (payload?.message as string) || '')

  if (!phone || !messageText) return

  const phoneNorm = normalizePhone(phone)

  // Load settings in parallel
  const [{ data: settings }, { data: aiSettings }] = await Promise.all([
    supabase.from('whatsapp_settings').select('*').limit(1).single(),
    supabase.from('ai_settings').select('*').limit(1).single(),
  ])

  if (!settings?.auto_reply_enabled) return

  // ── Find existing conversation by phone (unique — at most one row) ──
  const { data: existing } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('phone', phoneNorm)
    .maybeSingle()

  // Decide whether this counts as a "first contact" (welcome message)
  // or an ongoing chat (steer-to-platform reply):
  //   - No row yet                     → first contact
  //   - Row exists but idle > 24h      → restart (treat as first contact again)
  //   - Row exists and active          → ongoing
  const now = Date.now()
  const lastActivity = existing?.updated_at ? new Date(existing.updated_at).getTime() : 0
  const isExpired = existing && (now - lastActivity > CONVERSATION_TTL_MS)
  const isFirstContact = !existing || isExpired

  let conversation = existing

  if (!existing) {
    // Brand-new conversation
    const { data: newConv } = await supabase
      .from('whatsapp_conversations')
      .insert({ phone: phoneNorm, status: 'active', current_step: 'initial', raw_context: {} })
      .select()
      .single()
    conversation = newConv
  } else if (isExpired) {
    // Restart the existing row: clear context, reopen as active
    const { data: reopened } = await supabase
      .from('whatsapp_conversations')
      .update({
        status: 'active',
        current_step: 'initial',
        raw_context: {},
        closed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single()
    conversation = reopened
    await logStep(supabase, 'conversation_restarted', `phone:${phoneNorm} idleHours:${Math.round((now - lastActivity) / 3600000)}`)
  }

  // Save inbound message
  await supabase.from('whatsapp_messages').insert({
    conversation_id: conversation?.id,
    direction: 'inbound',
    message_text: messageText,
    raw_payload: {},
  })

  // Build reply
  const reply = isFirstContact
    ? buildWelcomeMessage(settings, aiSettings)
    : await buildAiReply(supabase, conversation, messageText, settings, aiSettings)

  if (reply) {
    await sendZApiMessage(supabase, phone, reply, conversation?.id as string, settings)

    await supabase
      .from('whatsapp_conversations')
      .update({
        current_step: isFirstContact ? 'chatting' : (conversation?.current_step || 'chatting'),
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversation?.id)
  }
}

// ─── Welcome message ──────────────────────────────────────────────────────────

function buildWelcomeMessage(
  settings: Record<string, unknown>,
  aiSettings: Record<string, unknown> | null,
): string {
  const attendantName = (settings.attendant_name as string) || 'Equipe de RH'
  const appUrl = process.env.APP_URL || 'https://recrutamento-selecao-ashen.vercel.app'
  const formLink = `${appUrl}/curriculo`

  const template = (settings.welcome_message as string) ||
    `Olá! Aqui é {ATENDENTE}, do Brownie do Ton 😊\n\nObrigado pelo contato! Ficamos felizes com seu interesse em fazer parte da nossa equipe.\n\nPara se candidatar, acesse nosso formulário:\n{LINK}\n\nApós o envio, nossa equipe de RH analisará seu perfil e entrará em contato. 😊`

  return template
    .replace(/\{ATENDENTE\}/g, attendantName)
    .replace(/\{LINK\}/g, formLink)
}

// ─── AI reply ─────────────────────────────────────────────────────────────────

async function buildAiReply(
  supabase: SupabaseClient,
  conversation: Record<string, unknown> | null,
  newMessage: string,
  settings: Record<string, unknown>,
  aiSettings: Record<string, unknown> | null,
): Promise<string> {
  if (!aiSettings) {
    await logStep(supabase, 'ai_skipped', 'no ai_settings row')
    return buildFallbackReply(settings)
  }

  // Decrypt API keys
  let openaiKey: string | null = null
  let anthropicKey: string | null = null

  try {
    if (aiSettings.openai_api_key_encrypted) {
      openaiKey = decryptToken(aiSettings.openai_api_key_encrypted as string)
      await logStep(supabase, 'openai_key', openaiKey ? `key length ${openaiKey.length}` : 'empty after decrypt')
    }
  } catch (e) {
    await logStep(supabase, 'openai_decrypt_error', String(e))
  }

  try {
    if (aiSettings.anthropic_api_key_encrypted) {
      anthropicKey = decryptToken(aiSettings.anthropic_api_key_encrypted as string)
    }
  } catch { /* ignore */ }

  if (!openaiKey && !anthropicKey) {
    await logStep(supabase, 'ai_skipped', 'no api key available after decrypt')
    return buildFallbackReply(settings)
  }

  // Respect configured whatsapp_provider: if set, use only that provider
  const configuredProvider = aiSettings?.whatsapp_provider as 'anthropic' | 'openai' | null | undefined
  if (configuredProvider === 'anthropic') { openaiKey = null }
  else if (configuredProvider === 'openai') { anthropicKey = null }

  // Load last 10 messages for context (the current inbound was just saved, so it's already included)
  const { data: history } = await supabase
    .from('whatsapp_messages')
    .select('direction, message_text')
    .eq('conversation_id', conversation?.id)
    .order('created_at', { ascending: false })
    .limit(10)

  // history is newest-first; reverse for chronological order and drop the last inbound
  // (it's already the current message — we pass it separately as newMessage)
  const orderedHistory = (history || []).reverse().slice(0, -1)

  const attendantName = (settings.attendant_name as string) || 'Atendente de RH'
  const appUrl = process.env.APP_URL || 'https://recrutamento-selecao-ashen.vercel.app'
  const formLink = `${appUrl}/curriculo`

  const basePrompt = (aiSettings.whatsapp_agent_prompt as string) ||
    `Você é ${attendantName}, assistente virtual de RH do Brownie do Ton.`

  const systemPrompt = [
    basePrompt,
    aiSettings.mission ? `Missão da empresa: ${aiSettings.mission}` : '',
    aiSettings.company_culture ? `Cultura: ${aiSettings.company_culture}` : '',
    '',
    'REGRA PRINCIPAL:',
    `Sua única função é orientar o candidato a preencher o currículo NA PLATAFORMA. SEMPRE inclua o link ${formLink} em sua resposta.`,
    '',
    'COMO RESPONDER:',
    '- Seja sempre breve (1 a 2 frases curtas, no máximo)',
    '- Tom amigável e acolhedor, mas direto',
    '- Se o candidato perguntar sobre vagas, salário, processo, horários etc., diga educadamente que essas informações são tratadas após o envio do currículo pela plataforma e envie o link',
    '- Se o candidato disser apenas "oi", "olá", "tudo bem?", agradeça o contato e envie o link do currículo',
    '- Se já enviou o currículo, agradeça e diga que o RH entrará em contato em breve',
    '- NUNCA prometa vagas, valores, datas ou retornos específicos',
    '- NÃO use markdown (sem asteriscos, sem negrito)',
    '- NÃO faça perguntas abertas — apenas direcione para a plataforma',
  ].filter(Boolean).join('\n')

  if (openaiKey) {
    const reply = await callOpenAI(supabase, openaiKey, systemPrompt, orderedHistory, newMessage)
    if (reply) return reply
  }

  if (anthropicKey) {
    const reply = await callAnthropic(supabase, anthropicKey, systemPrompt, orderedHistory, newMessage)
    if (reply) return reply
  }

  return buildFallbackReply(settings)
}

function buildFallbackReply(settings: Record<string, unknown>): string {
  const appUrl = process.env.APP_URL || 'https://recrutamento-selecao-ashen.vercel.app'
  return `Obrigado pela mensagem! 😊\n\nPara se candidatar, preencha seu currículo na nossa plataforma:\n${appUrl}/curriculo\n\nNossa equipe de RH retornará em breve!`
}

// ─── OpenAI ───────────────────────────────────────────────────────────────────

async function callOpenAI(
  supabase: SupabaseClient,
  apiKey: string,
  systemPrompt: string,
  history: { direction: string; message_text: string }[],
  newMessage: string,
): Promise<string | null> {
  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map(m => ({
        role: m.direction === 'inbound' ? 'user' : 'assistant',
        content: m.message_text,
      })),
      { role: 'user', content: newMessage },
    ]

    await logStep(supabase, 'openai_call_start', `messages: ${messages.length}`)

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages, max_tokens: 400, temperature: 0.7 }),
    })

    const responseText = await res.text()
    await logStep(supabase, 'openai_response', `status:${res.status} body:${responseText.slice(0, 300)}`)

    if (!res.ok) return null
    const data = JSON.parse(responseText)
    return data.choices?.[0]?.message?.content?.trim() || null
  } catch (e) {
    await logStep(supabase, 'openai_error', String(e))
    return null
  }
}

// ─── Anthropic ────────────────────────────────────────────────────────────────

async function callAnthropic(
  supabase: SupabaseClient,
  apiKey: string,
  systemPrompt: string,
  history: { direction: string; message_text: string }[],
  newMessage: string,
): Promise<string | null> {
  try {
    const messages = [
      ...history.map(m => ({
        role: m.direction === 'inbound' ? 'user' : 'assistant',
        content: m.message_text,
      })),
      { role: 'user', content: newMessage },
    ]

    const deduped: { role: string; content: string }[] = []
    for (const m of messages) {
      if (deduped.length > 0 && deduped[deduped.length - 1].role === m.role) {
        deduped[deduped.length - 1].content += '\n' + m.content
      } else {
        deduped.push(m)
      }
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'claude-haiku-20240307', max_tokens: 400, system: systemPrompt, messages: deduped }),
    })

    const responseText = await res.text()
    await logStep(supabase, 'anthropic_response', `status:${res.status} body:${responseText.slice(0, 300)}`)

    if (!res.ok) return null
    const data = JSON.parse(responseText)
    return data.content?.[0]?.text?.trim() || null
  } catch (e) {
    await logStep(supabase, 'anthropic_error', String(e))
    return null
  }
}

// ─── Z-API send ───────────────────────────────────────────────────────────────

async function sendZApiMessage(
  supabase: SupabaseClient,
  phone: string,
  message: string,
  conversationId: string,
  settings: Record<string, unknown>,
) {
  try {
    if (!settings?.is_active || !settings?.instance_id) {
      await logStep(supabase, 'zapi_skipped', 'not active or no instance_id')
      await supabase.from('whatsapp_messages').insert({
        conversation_id: conversationId,
        direction: 'outbound',
        message_text: message,
        raw_payload: { note: 'Z-API not configured' },
      })
      return
    }

    const token = decryptToken(settings.instance_token_encrypted as string)
    const clientToken = decryptToken(settings.client_token_encrypted as string)
    const url = `${settings.api_base_url}/instances/${settings.instance_id}/token/${token}/send-text`

    await logStep(supabase, 'zapi_send_start', `to:${phone} url:${url.replace(token, '***')}`)

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'client-token': clientToken },
      body: JSON.stringify({
        phone,
        message,
        delayMessage: 3,   // 3s delay before sending — avoids WhatsApp bot-detection/shadowban
        delayTyping: 2,    // 2s "typing..." indicator — simulates human behavior
      }),
    })

    const responseText = await response.text()
    await logStep(supabase, 'zapi_send_response', `status:${response.status} body:${responseText.slice(0, 500)}`)

    let responseData: Record<string, unknown> = {}
    try { responseData = JSON.parse(responseText) } catch { /* ignore */ }

    await supabase.from('whatsapp_messages').insert({
      conversation_id: conversationId,
      direction: 'outbound',
      message_text: message,
      raw_payload: { phone, zapi_status: response.status, zapi_response: responseData },
      zapi_message_id: responseData?.zaapId as string || null,
    })

    if (settings.id) {
      await supabase
        .from('whatsapp_settings')
        .update({ last_message_received_at: new Date().toISOString() })
        .eq('id', settings.id as string)
    }
  } catch (err) {
    await logStep(supabase, 'zapi_send_error', String(err))
    console.error('Z-API send error:', err)
  }
}

// ─── Step logger ──────────────────────────────────────────────────────────────

async function logStep(supabase: SupabaseClient, action: string, detail: string) {
  try {
    await supabase.from('whatsapp_logs').insert({
      direction: 'outbound',
      action,
      status: 'debug',
      message: detail,
    })
  } catch { /* best-effort */ }
}
