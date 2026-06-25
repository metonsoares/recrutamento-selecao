import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { sendWhatsAppRaw } from '@/lib/whatsapp'
import { notifyInterviewerCancelled } from '@/lib/interview-notify'

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const { reason } = await req.json()
    if (!reason?.trim()) return NextResponse.json({ error: 'Informe o motivo do cancelamento.' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()
    const { data: invite } = await supabase
      .from('interview_invites')
      .select('*, candidates(full_name, phone)')
      .eq('token', token).maybeSingle()
    if (!invite) return NextResponse.json({ error: 'Convite inválido.' }, { status: 404 })
    if (invite.status !== 'agendada' || !invite.interview_id) {
      return NextResponse.json({ error: 'Não há agendamento ativo para cancelar.' }, { status: 409 })
    }

    // Marca a entrevista como cancelada com o motivo
    const { error } = await supabase.from('interviews')
      .update({ status: 'cancelada', cancel_reason: reason.trim(), cancelled_at: new Date().toISOString() })
      .eq('id', invite.interview_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    await supabase.from('interview_invites').update({ status: 'cancelada' }).eq('id', invite.id)

    // Volta a candidatura para "apto para entrevista" (recrutador pode reconvidar)
    const { data: cand } = await supabase.from('candidates').select('latest_application_id').eq('id', invite.candidate_id).maybeSingle()
    if (cand?.latest_application_id) {
      await supabase.from('applications').update({ status: 'apto_para_entrevista', updated_at: new Date().toISOString() }).eq('id', cand.latest_application_id)
    }

    const candidate = invite.candidates as { full_name?: string; phone?: string } | null
    const firstName = String(candidate?.full_name || '').split(' ')[0]
    if (candidate?.phone) {
      await sendWhatsAppRaw(candidate.phone, `Olá ${firstName}, seu agendamento de entrevista foi cancelado conforme solicitado. Se quiser remarcar, é só nos avisar. Obrigado!`, 'interview_cancel')
    }

    // Notifica o entrevistador responsável sobre o cancelamento (com o motivo)
    await notifyInterviewerCancelled(invite.interview_id, reason)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[interview cancel]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
