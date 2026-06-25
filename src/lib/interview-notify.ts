/**
 * Notificação ao entrevistador responsável quando uma entrevista é agendada.
 * Chamado nos dois pontos de criação de entrevista:
 *  - auto-agendamento do candidato pelo link público;
 *  - criação manual pelo admin na Agenda de entrevistas.
 * Fire-and-forget: nunca lança (não derruba o agendamento se o WhatsApp falhar).
 */
import { createSupabaseServiceClient } from './supabase-server'
import { sendWhatsAppRaw } from './whatsapp'

export async function notifyInterviewerScheduled(
  interviewId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServiceClient()
    const { data: itv } = await supabase
      .from('interviews')
      .select('scheduled_at, candidates(full_name, phone), interviewers(name, phone), interview_locations(name, address)')
      .eq('id', interviewId)
      .maybeSingle()
    if (!itv) return { ok: false, error: 'Entrevista não encontrada.' }

    const interviewer = itv.interviewers as { name?: string; phone?: string } | null
    if (!interviewer?.phone) {
      // Entrevistador sem telefone cadastrado — não há como notificar por WhatsApp.
      return { ok: false, error: 'Entrevistador sem telefone cadastrado.' }
    }

    const candidate = itv.candidates as { full_name?: string; phone?: string } | null
    const location = itv.interview_locations as { name?: string; address?: string } | null

    const when = new Date(itv.scheduled_at as string)
    const diaFmt = when.toLocaleDateString('pt-BR', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo',
    })
    const horaFmt = when.toLocaleTimeString('pt-BR', {
      hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
    })
    const candName = candidate?.full_name || 'Candidato'
    const candPhoneLine = candidate?.phone ? `\n📞 Contato: ${candidate.phone}` : ''
    const localTxt = location?.name
      ? `${location.name}${location.address ? ` (${location.address})` : ''}`
      : 'a ser informado'
    const ola = interviewer.name ? `Olá ${interviewer.name.split(' ')[0]}, ` : ''

    const msg =
      `${ola}uma nova entrevista foi agendada! 📅\n\n` +
      `👤 Candidato: ${candName}${candPhoneLine}\n` +
      `📆 Dia: ${diaFmt}\n` +
      `🕐 Horário: ${horaFmt}\n` +
      `📍 Local: ${localTxt}\n\n` +
      `Você é o entrevistador responsável. Confira os detalhes na Agenda de entrevistas.`

    return await sendWhatsAppRaw(interviewer.phone, msg, 'interview_interviewer_notice')
  } catch (err) {
    console.error('[notifyInterviewerScheduled]', err)
    return { ok: false, error: String(err) }
  }
}
