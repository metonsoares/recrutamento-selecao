/**
 * Notificações por WhatsApp ao entrevistador responsável sobre entrevistas.
 *  - notifyInterviewerScheduled: quando uma entrevista é agendada (auto-agendamento
 *    do candidato pelo link OU criação manual pelo admin);
 *  - notifyInterviewerCancelled: quando o candidato cancela o agendamento.
 * Fire-and-forget: nunca lança (não derruba o fluxo se o WhatsApp falhar).
 */
import { createSupabaseServiceClient } from './supabase-server'
import { sendWhatsAppRaw } from './whatsapp'

interface NoticeData {
  interviewerPhone: string
  interviewerFirst: string
  candName: string
  candPhoneLine: string
  diaFmt: string
  horaFmt: string
  localTxt: string
}

/** Carrega e formata os dados da entrevista para a notificação. Retorna null se
 *  a entrevista não existir ou o entrevistador não tiver telefone cadastrado. */
async function loadNoticeData(interviewId: string): Promise<NoticeData | null> {
  const supabase = await createSupabaseServiceClient()
  const { data: itv } = await supabase
    .from('interviews')
    .select('scheduled_at, candidates(full_name, phone), interviewers(name, phone), interview_locations(name, address)')
    .eq('id', interviewId)
    .maybeSingle()
  if (!itv) return null

  const interviewer = itv.interviewers as { name?: string; phone?: string } | null
  if (!interviewer?.phone) return null

  const candidate = itv.candidates as { full_name?: string; phone?: string } | null
  const location = itv.interview_locations as { name?: string; address?: string } | null
  const when = new Date(itv.scheduled_at as string)

  return {
    interviewerPhone: interviewer.phone,
    interviewerFirst: interviewer.name ? interviewer.name.split(' ')[0] : '',
    candName: candidate?.full_name || 'Candidato',
    candPhoneLine: candidate?.phone ? `\n📞 Contato: ${candidate.phone}` : '',
    diaFmt: when.toLocaleDateString('pt-BR', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo',
    }),
    horaFmt: when.toLocaleTimeString('pt-BR', {
      hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
    }),
    localTxt: location?.name
      ? `${location.name}${location.address ? ` (${location.address})` : ''}`
      : 'a ser informado',
  }
}

export async function notifyInterviewerScheduled(
  interviewId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const d = await loadNoticeData(interviewId)
    if (!d) return { ok: false, error: 'Entrevista sem dados ou entrevistador sem telefone.' }
    const ola = d.interviewerFirst ? `Olá ${d.interviewerFirst}, ` : ''
    const msg =
      `${ola}uma nova entrevista foi agendada! 📅\n\n` +
      `👤 Candidato: ${d.candName}${d.candPhoneLine}\n` +
      `📆 Dia: ${d.diaFmt}\n` +
      `🕐 Horário: ${d.horaFmt}\n` +
      `📍 Local: ${d.localTxt}\n\n` +
      `Você é o entrevistador responsável. Confira os detalhes na Agenda de entrevistas.`
    return await sendWhatsAppRaw(d.interviewerPhone, msg, 'interview_interviewer_notice')
  } catch (err) {
    console.error('[notifyInterviewerScheduled]', err)
    return { ok: false, error: String(err) }
  }
}

export async function notifyInterviewerCancelled(
  interviewId: string,
  reason?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const d = await loadNoticeData(interviewId)
    if (!d) return { ok: false, error: 'Entrevista sem dados ou entrevistador sem telefone.' }
    const ola = d.interviewerFirst ? `Olá ${d.interviewerFirst}, ` : ''
    const motivo = reason?.trim() ? `\n📝 Motivo: ${reason.trim()}` : ''
    const msg =
      `${ola}uma entrevista foi *cancelada*. ❌\n\n` +
      `👤 Candidato: ${d.candName}${d.candPhoneLine}\n` +
      `📆 Dia: ${d.diaFmt}\n` +
      `🕐 Horário: ${d.horaFmt}\n` +
      `📍 Local: ${d.localTxt}${motivo}\n\n` +
      `Esse horário ficou livre na sua agenda.`
    return await sendWhatsAppRaw(d.interviewerPhone, msg, 'interview_interviewer_cancel')
  } catch (err) {
    console.error('[notifyInterviewerCancelled]', err)
    return { ok: false, error: String(err) }
  }
}
