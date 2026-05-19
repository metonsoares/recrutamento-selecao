import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { normalizePhone } from '@/lib/helpers'

/**
 * POST /api/admin/candidatos/[id]/schedule-interview
 * - Marks the latest application as 'entrevista_agendada'
 * - Sends a WhatsApp congratulation message to the candidate
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // Auth gate
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

  if (!candidate) {
    return NextResponse.json({ error: 'Candidato não encontrado.' }, { status: 404 })
  }

  // Update latest application status
  const { data: app } = await service
    .from('applications')
    .select('id')
    .eq('candidate_id', id)
    .eq('is_latest', true)
    .maybeSingle()

  if (app) {
    await service
      .from('applications')
      .update({ status: 'entrevista_agendada', updated_at: new Date().toISOString() })
      .eq('id', app.id)
  }

  // Send WhatsApp message if candidate has a phone number
  let whatsappSent = false
  const rawPhone = candidate.phone || candidate.phone_normalized

  if (rawPhone) {
    const phoneNorm = candidate.phone_normalized || normalizePhone(rawPhone)
    const firstName = (candidate.full_name as string).split(' ')[0]

    const message =
      `Olá, ${firstName}! 🎉\n\n` +
      `Parabéns! Você foi selecionado(a) para uma entrevista na *Brownie do Ton*!\n\n` +
      `Nossa equipe de RH entrará em contato em breve para confirmar a data e o horário. ` +
      `Fique atento(a) às próximas mensagens. 😊\n\n` +
      `— Equipe Brownie do Ton`

    // Find existing WhatsApp conversation to log the outbound message
    const { data: conv } = await service
      .from('whatsapp_conversations')
      .select('id')
      .eq('phone', phoneNorm)
      .maybeSingle()

    whatsappSent = await sendWhatsAppMessage(rawPhone, message, conv?.id)
  }

  return NextResponse.json({ ok: true, whatsappSent })
}
