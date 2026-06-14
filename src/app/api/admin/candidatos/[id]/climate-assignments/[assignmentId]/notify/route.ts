import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { publicAppUrl } from '@/lib/helpers'
import { sendWhatsAppRaw } from '@/lib/whatsapp'

/**
 * POST /api/admin/candidatos/[id]/climate-assignments/[assignmentId]/notify
 * Envia ao funcionário, por WhatsApp, o link para preencher a pesquisa de clima.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; assignmentId: string }> }) {
  try {
    const auth = await createSupabaseServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

    const { id, assignmentId } = await params
    const supabase = await createSupabaseServiceClient()

    const { data: assignment } = await supabase
      .from('climate_assignments')
      .select('id, candidate_id, climate_surveys(title, token)')
      .eq('id', assignmentId).eq('candidate_id', id).maybeSingle()
    if (!assignment) return NextResponse.json({ error: 'Pesquisa não encontrada na ficha.' }, { status: 404 })

    const survey = assignment.climate_surveys as { title?: string; token?: string } | { title?: string; token?: string }[] | null
    const s = Array.isArray(survey) ? survey[0] : survey
    const token = s?.token
    if (!token) return NextResponse.json({ error: 'Pesquisa sem link público configurado.' }, { status: 400 })

    const { data: candidate } = await supabase
      .from('candidates').select('full_name, phone').eq('id', id).maybeSingle()
    if (!candidate) return NextResponse.json({ error: 'Funcionário não encontrado.' }, { status: 404 })
    if (!candidate.phone) return NextResponse.json({ error: 'Funcionário sem telefone cadastrado.' }, { status: 400 })

    const link = `${publicAppUrl()}/pesquisa/${token}?c=${id}`
    const firstName = String(candidate.full_name).split(' ')[0]

    const message =
      `Oi, ${firstName}, tudo bem?\n\n` +
      `Essa é uma pesquisa de clima da empresa. Não tem certo ou errado nas respostas. ` +
      `Peço apenas que você seja o mais transparente e sincero possível, porque isso ajuda a gente a ` +
      `entender melhor o perfil de cada pessoa dentro da companhia.\n\n` +
      `Clique no link para acessar e preencher: ${link}\n\n` +
      `Obrigado pela sua colaboração!`

    const sent = await sendWhatsAppRaw(candidate.phone as string, message, 'climate_survey')
    if (!sent.ok) {
      return NextResponse.json({ error: `Falha ao enviar WhatsApp: ${sent.error}` }, { status: 502 })
    }

    const sentAt = new Date().toISOString()
    await supabase.from('climate_assignments').update({ whatsapp_sent_at: sentAt }).eq('id', assignmentId)

    return NextResponse.json({ ok: true, whatsapp_sent_at: sentAt })
  } catch (err) {
    console.error('[climate notify]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
