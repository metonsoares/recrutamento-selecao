import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { generateToken, normalizePhone } from '@/lib/helpers'

/**
 * POST /api/admin/candidatos/[id]/send-culture-test
 * - Generates a culture test token (7 days)
 * - Updates application status to 'aguardando_teste_cultural'
 * - Sends a WhatsApp message with the culture test link
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

  // Fetch latest application
  const { data: app } = await service
    .from('applications')
    .select('id, job_id, jobs(title)')
    .eq('candidate_id', id)
    .eq('is_latest', true)
    .maybeSingle()

  if (!app) return NextResponse.json({ error: 'Nenhuma candidatura encontrada.' }, { status: 404 })

  // Generate token valid for 7 days
  const token = generateToken()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  // Update application with token and new status
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

  // Build culture test URL
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  const testUrl = `${appUrl}/candidato/teste-cultural?token=${token}`

  // Send WhatsApp
  let whatsappSent = false
  const rawPhone = candidate.phone || candidate.phone_normalized

  if (rawPhone) {
    const phoneNorm = candidate.phone_normalized || normalizePhone(rawPhone)
    const firstName = (candidate.full_name as string).split(' ')[0]
    const jobTitle = (app.jobs as { title?: string } | null)?.title || 'nossa empresa'

    const message =
      `Olá, ${firstName}! 🎯\n\n` +
      `Você está participando do processo seletivo para a vaga de *${jobTitle}* na *Brownie do Ton*!\n\n` +
      `Para darmos continuidade, precisamos que você responda ao nosso Teste Cultural. ` +
      `São apenas algumas perguntas rápidas, leva poucos minutinhos 😊\n\n` +
      `👉 Clique aqui para responder:\n${testUrl}\n\n` +
      `O link é válido por 7 dias. Qualquer dúvida, é só chamar!\n` +
      `— Equipe Brownie do Ton`

    const { data: conv } = await service
      .from('whatsapp_conversations')
      .select('id')
      .eq('phone', phoneNorm)
      .maybeSingle()

    whatsappSent = await sendWhatsAppMessage(rawPhone, message, conv?.id)
  }

  return NextResponse.json({ ok: true, whatsappSent, testUrl })
}
