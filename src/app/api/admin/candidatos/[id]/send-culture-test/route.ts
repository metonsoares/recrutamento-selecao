import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { generateToken, normalizePhone, decryptToken } from '@/lib/helpers'

/**
 * POST /api/admin/candidatos/[id]/send-culture-test
 * - Gera token do teste cultural (7 dias)
 * - Atualiza status da candidatura para 'aguardando_teste_cultural'
 * - Envia link via Z-API (WhatsApp) diretamente, sem checar is_active
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // Auth
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const service = await createSupabaseServiceClient()

  // Fetch candidate
  const { data: candidate } = await service
    .from('candidates')
    .select('id, full_name, phone, phone_normalized')
    .eq('id', id)
    .single()
  if (!candidate) return NextResponse.json({ error: 'Candidato não encontrado.' }, { status: 404 })

  // Fetch latest application (with job title)
  const { data: app } = await service
    .from('applications')
    .select('id, job_id, jobs(title)')
    .eq('candidate_id', id)
    .eq('is_latest', true)
    .maybeSingle()
  if (!app) return NextResponse.json({ error: 'Nenhuma candidatura encontrada.' }, { status: 404 })

  // Resolve job title (can be in jobs join or need UUID lookup via form_answer)
  let jobTitle = (app.jobs as { title?: string } | null)?.title ?? null
  if (!jobTitle && app.job_id) {
    const { data: jobRow } = await service
      .from('jobs').select('title').eq('id', app.job_id).single()
    jobTitle = jobRow?.title ?? null
  }
  if (!jobTitle) jobTitle = 'nossa seleção de colaboradores'

  // Generate token — valid 7 days
  const token = generateToken()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { error: updateErr } = await service.from('applications').update({
    culture_test_token: token,
    culture_test_token_expires_at: expiresAt,
    status: 'aguardando_teste_cultural',
    updated_at: new Date().toISOString(),
  }).eq('id', app.id)

  if (updateErr) {
    console.error('[send-culture-test] DB update error:', updateErr)
    return NextResponse.json({ error: 'Erro ao gerar token.' }, { status: 500 })
  }

  // Culture test URL
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  const testUrl = `${appUrl}/candidato/teste-cultural?token=${token}`

  // ── Z-API: send WhatsApp directly (bypass is_active check) ───────────────
  let whatsappSent = false
  let whatsappError: string | null = null
  const rawPhone = candidate.phone || candidate.phone_normalized

  if (rawPhone) {
    const phoneNorm = candidate.phone_normalized || normalizePhone(rawPhone)
    const firstName = (candidate.full_name as string).split(' ')[0]

    const message =
      `Olá, ${firstName}! 🎯\n\n` +
      `Você está participando do processo seletivo para a vaga de *${jobTitle}* na *Brownie do Ton*!\n\n` +
      `Para darmos continuidade, pedimos que você responda ao nosso Teste Cultural. ` +
      `São poucas perguntas e leva menos de 5 minutos 😊\n\n` +
      `👉 Acesse aqui:\n${testUrl}\n\n` +
      `O link é válido por 7 dias. Qualquer dúvida é só chamar!\n` +
      `— Equipe Brownie do Ton`

    // Fetch Z-API settings
    const { data: wSettings } = await service
      .from('whatsapp_settings')
      .select('instance_id, instance_token_encrypted, client_token_encrypted, api_base_url')
      .limit(1).single()

    if (!wSettings?.instance_id || !wSettings?.instance_token_encrypted || !wSettings?.api_base_url) {
      whatsappError = 'Z-API não configurada (instance_id ou token ausente).'
      console.warn('[send-culture-test] WhatsApp not configured:', whatsappError)
    } else {
      try {
        const instanceToken = decryptToken(wSettings.instance_token_encrypted as string)
        const clientToken = wSettings.client_token_encrypted
          ? decryptToken(wSettings.client_token_encrypted as string)
          : null

        const zapiUrl = `${wSettings.api_base_url}/instances/${wSettings.instance_id}/token/${instanceToken}/send-text`

        const zapiRes = await fetch(zapiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(clientToken ? { 'client-token': clientToken } : {}),
          },
          body: JSON.stringify({ phone: rawPhone, message }),
        })

        const zapiData = await zapiRes.json().catch(() => ({}))

        // Log to whatsapp_logs
        await service.from('whatsapp_logs').insert({
          direction: 'outbound',
          action: 'send_culture_test',
          phone: rawPhone,
          message,
          status: zapiRes.ok ? 'sent' : 'error',
          response_payload: zapiData,
        }).catch(() => {})

        // Also log in conversation if it exists
        const { data: conv } = await service
          .from('whatsapp_conversations')
          .select('id').eq('phone', phoneNorm).maybeSingle()
        if (conv?.id) {
          await service.from('whatsapp_messages').insert({
            conversation_id: conv.id,
            direction: 'outbound',
            message_text: message,
            raw_payload: { phone: rawPhone, zapi_status: zapiRes.status, zapi_response: zapiData },
          }).catch(() => {})
        }

        whatsappSent = zapiRes.ok
        if (!zapiRes.ok) {
          whatsappError = `Z-API retornou ${zapiRes.status}: ${JSON.stringify(zapiData)}`
          console.error('[send-culture-test] Z-API error:', whatsappError)
        }
      } catch (err) {
        whatsappError = String(err)
        console.error('[send-culture-test] Z-API fetch error:', err)
      }
    }
  }

  return NextResponse.json({ ok: true, whatsappSent, whatsappError, testUrl })
}
