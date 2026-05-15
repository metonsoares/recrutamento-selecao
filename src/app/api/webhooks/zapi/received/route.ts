import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { normalizePhone, generateToken } from '@/lib/helpers'

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    const supabase = await createSupabaseServiceClient()

    // Log raw payload
    await supabase.from('whatsapp_logs').insert({
      direction: 'inbound',
      action: 'webhook_received',
      phone: payload?.phone || payload?.from || '',
      message: payload?.text?.message || payload?.message || '',
      status: 'received',
      request_payload: payload,
    })

    const phone = payload?.phone || payload?.from || ''
    const messageText = payload?.text?.message || payload?.message || ''

    if (!phone || !messageText) return NextResponse.json({ ok: true })

    const phoneNorm = normalizePhone(phone)

    // Find or create conversation
    let { data: conversation } = await supabase
      .from('whatsapp_conversations')
      .select('*, candidates(id, full_name, lgpd_accepted)')
      .eq('phone', phoneNorm)
      .eq('status', 'active')
      .single()

    if (!conversation) {
      const { data: newConv } = await supabase
        .from('whatsapp_conversations')
        .insert({ phone: phoneNorm, status: 'active', current_step: 'initial', raw_context: {} })
        .select()
        .single()
      conversation = newConv
    }

    // Save inbound message
    await supabase.from('whatsapp_messages').insert({
      conversation_id: conversation?.id,
      candidate_id: conversation?.candidate_id || null,
      direction: 'inbound',
      message_text: messageText,
      raw_payload: payload,
      zapi_message_id: payload?.messageId || null,
    })

    // Process conversation flow
    await processConversation(supabase, conversation, messageText, phoneNorm)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Webhook error:', err)
    return NextResponse.json({ ok: true })
  }
}

async function processConversation(supabase: Awaited<ReturnType<typeof createSupabaseServiceClient>>, conversation: Record<string, unknown>, message: string, phone: string) {
  const step = (conversation?.current_step as string) || 'initial'
  const context = (conversation?.raw_context as Record<string, string>) || {}
  const msgLower = message.toLowerCase().trim()

  let reply = ''
  let nextStep = step
  let updatedContext = { ...context }

  if (step === 'initial') {
    reply = `Olá! Sou a assistente virtual de RH do Brownie do Ton 😊\n\nVou te ajudar no primeiro cadastro para nosso processo seletivo. Antes de começar, preciso te informar que seus dados serão usados apenas para fins de recrutamento e seleção.\n\nPodemos continuar? (responda *Sim* ou *Não*)`
    nextStep = 'awaiting_lgpd'
  } else if (step === 'awaiting_lgpd') {
    if (msgLower.includes('sim') || msgLower === 's') {
      reply = 'Perfeito! 😊\n\nPara começar, me informe seu *nome completo*, por favor.'
      nextStep = 'awaiting_name'
    } else {
      reply = 'Tudo bem! Se mudar de ideia, é só nos chamar novamente. Até logo! 👋'
      nextStep = 'closed'
    }
  } else if (step === 'awaiting_name') {
    updatedContext.name = message
    reply = `Prazer, *${message}*! 😊\n\nQual seu *e-mail*? (ou digite "não tenho" para pular)`
    nextStep = 'awaiting_email'
  } else if (step === 'awaiting_email') {
    updatedContext.email = msgLower === 'não tenho' ? '' : message
    reply = 'Em qual *cidade* você mora?'
    nextStep = 'awaiting_city'
  } else if (step === 'awaiting_city') {
    updatedContext.city = message
    reply = 'E em qual *bairro*?'
    nextStep = 'awaiting_neighborhood'
  } else if (step === 'awaiting_neighborhood') {
    updatedContext.neighborhood = message
    reply = 'Qual *vaga* você tem interesse?\n\n(Ex: Atendimento, Garçom, Caixa, Cozinha, Confeitaria, Delivery, Limpeza, Administrativo)'
    nextStep = 'awaiting_job'
  } else if (step === 'awaiting_job') {
    updatedContext.job = message

    // Create candidate and application
    try {
      const { normalizeEmail } = await import('@/lib/helpers')
      const phoneNorm = normalizePhone(phone)

      let { data: candidate } = await supabase
        .from('candidates')
        .select('id')
        .eq('phone_normalized', phoneNorm)
        .single()

      if (!candidate) {
        const { data: newCand } = await supabase.from('candidates').insert({
          full_name: updatedContext.name,
          phone,
          phone_normalized: phoneNorm,
          email: updatedContext.email || null,
          email_normalized: updatedContext.email ? normalizeEmail(updatedContext.email) : null,
          city: updatedContext.city,
          neighborhood: updatedContext.neighborhood,
          lgpd_accepted: true,
          lgpd_accepted_at: new Date().toISOString(),
          source: 'whatsapp',
        }).select().single()
        candidate = newCand
      }

      if (candidate) {
        await supabase.from('applications').update({ is_latest: false }).eq('candidate_id', candidate.id)

        const expToken = generateToken()
        const expExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

        const { data: app } = await supabase.from('applications').insert({
          candidate_id: candidate.id,
          status: 'aguardando_formulario_experiencia',
          source: 'whatsapp',
          is_latest: true,
          experience_form_token: expToken,
          experience_form_token_expires_at: expExpires,
        }).select().single()

        if (app) {
          await supabase.from('candidates').update({ latest_application_id: app.id }).eq('id', candidate.id)
          await supabase.from('whatsapp_conversations').update({ candidate_id: candidate.id }).eq('id', conversation.id)

          const appUrl = process.env.APP_URL || 'http://localhost:3000'
          const formLink = `${appUrl}/candidato/experiencia?token=${expToken}`
          reply = `Cadastro inicial feito com sucesso! ✅\n\nAgora preciso que você preencha um formulário rápido sobre sua experiência profissional:\n\n${formLink}\n\nAssim que terminar, você receberá o link para o teste cultural. 😊`
          nextStep = 'form_sent'
        }
      }
    } catch (err) {
      console.error('Error creating candidate:', err)
      reply = 'Ocorreu um problema ao criar seu cadastro. Por favor, tente novamente mais tarde.'
    }
  } else {
    reply = 'Olá! Seu cadastro já está em andamento. Qualquer dúvida, nossa equipe de RH entrará em contato. 😊'
  }

  // Update conversation
  await supabase.from('whatsapp_conversations').update({
    current_step: nextStep,
    raw_context: updatedContext,
    updated_at: new Date().toISOString(),
  }).eq('id', conversation.id)

  // Send reply via Z-API
  if (reply) {
    await sendZApiMessage(supabase, phone, reply, conversation.id as string)
  }
}

async function sendZApiMessage(supabase: Awaited<ReturnType<typeof createSupabaseServiceClient>>, phone: string, message: string, conversationId: string) {
  try {
    const { data: settings } = await supabase.from('whatsapp_settings').select('*').limit(1).single()
    if (!settings?.is_active || !settings?.instance_id) {
      await supabase.from('whatsapp_messages').insert({
        conversation_id: conversationId,
        direction: 'outbound',
        message_text: message,
        raw_payload: { note: 'Z-API not configured' },
      })
      return
    }

    const { decryptToken } = await import('@/lib/helpers')
    const token = decryptToken(settings.instance_token_encrypted)
    const clientToken = decryptToken(settings.client_token_encrypted)

    const url = `${settings.api_base_url}/instances/${settings.instance_id}/token/${token}/send-text`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'client-token': clientToken },
      body: JSON.stringify({ phone, message }),
    })
    const responseData = await response.json()

    await supabase.from('whatsapp_messages').insert({
      conversation_id: conversationId,
      direction: 'outbound',
      message_text: message,
      raw_payload: { phone, message },
      zapi_message_id: responseData?.zaapId || null,
    })

    await supabase.from('whatsapp_settings').update({ last_message_received_at: new Date().toISOString() }).eq('id', settings.id)
  } catch (err) {
    console.error('Z-API send error:', err)
  }
}
