import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { generateToken } from '@/lib/helpers'
import { sendWhatsAppRaw } from '@/lib/whatsapp'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { interviewer_id, location_id, dates } = await req.json()
    if (!interviewer_id) return NextResponse.json({ error: 'Selecione o entrevistador.' }, { status: 400 })
    if (!Array.isArray(dates) || dates.length === 0) return NextResponse.json({ error: 'Selecione ao menos uma data.' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()
    const { data: candidate } = await supabase.from('candidates').select('id, full_name, phone').eq('id', id).maybeSingle()
    if (!candidate) return NextResponse.json({ error: 'Candidato não encontrado.' }, { status: 404 })
    if (!candidate.phone) return NextResponse.json({ error: 'Candidato sem telefone cadastrado.' }, { status: 400 })

    const token = generateToken()
    const { data: invite, error } = await supabase.from('interview_invites').insert({
      token, candidate_id: id, interviewer_id, location_id: location_id || null, dates, status: 'pendente',
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
    const link = `${appUrl}/entrevista/${token}`
    const firstName = String(candidate.full_name).split(' ')[0]
    const message = `Olá ${firstName}, recebemos seu cadastro e gostaríamos de agendar uma entrevista presencial. Clique no link e selecione o dia disponível para realizar seu agendamento.\n\n${link}`

    const sent = await sendWhatsAppRaw(candidate.phone as string, message, 'interview_invite')
    if (!sent.ok) {
      return NextResponse.json({ ok: false, error: `Convite criado, mas falha ao enviar WhatsApp: ${sent.error}`, invite, link }, { status: 502 })
    }
    return NextResponse.json({ ok: true, invite, link })
  } catch (err) {
    console.error('[interview-invite]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
