import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { sendWhatsAppRaw } from '@/lib/whatsapp'

/** Idade a partir de 'YYYY-MM-DD' ou 'DD/MM/YYYY'. */
function ageFrom(birth?: string | null): number | null {
  if (!birth) return null
  let y = 0, m = 0, d = 0
  const iso = birth.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3] }
  else {
    const br = birth.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
    if (!br) return null
    d = +br[1]; m = +br[2]; y = +br[3]
  }
  const t = new Date()
  let age = t.getFullYear() - y
  const mo = t.getMonth() + 1
  if (mo < m || (mo === m && t.getDate() < d)) age--
  return age >= 0 && age < 120 ? age : null
}

function unquote(text: string | null | undefined): string {
  if (!text) return ''
  try { const p = JSON.parse(text); return typeof p === 'string' ? p : String(p) } catch { return text }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await createSupabaseServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

    const { id } = await params
    const { recruiter_id } = await req.json()
    if (!recruiter_id) return NextResponse.json({ error: 'Selecione um recrutador.' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()

    // ── Recrutador (usuário admin) — nome e WhatsApp ──────────────────────────
    const { data: recruiterRes, error: recErr } = await supabase.auth.admin.getUserById(recruiter_id)
    if (recErr || !recruiterRes?.user) {
      return NextResponse.json({ error: 'Recrutador não encontrado.' }, { status: 404 })
    }
    const meta = recruiterRes.user.user_metadata || {}
    const recruiterName = (meta.full_name as string | undefined)?.trim() || 'recrutador(a)'
    const recruiterPhone = (meta.phone as string | undefined)?.trim() || ''
    if (!recruiterPhone) {
      return NextResponse.json({ error: 'Este recrutador não tem WhatsApp cadastrado. Edite o usuário em Configurações → Usuários.' }, { status: 400 })
    }

    // ── Candidato ─────────────────────────────────────────────────────────────
    const { data: candidate } = await supabase
      .from('candidates')
      .select('id, full_name, latest_application_id')
      .eq('id', id).maybeSingle()
    if (!candidate) return NextResponse.json({ error: 'Candidato não encontrado.' }, { status: 404 })

    // ── Última candidatura: parecer da IA + vaga ─────────────────────────────
    let app: Record<string, unknown> | null = null
    if (candidate.latest_application_id) {
      const { data } = await supabase.from('applications')
        .select('id, job_id, ai_recommendation, ai_raw_response').eq('id', candidate.latest_application_id).maybeSingle()
      app = data as Record<string, unknown> | null
    }
    if (!app) {
      const { data } = await supabase.from('applications')
        .select('id, job_id, ai_recommendation, ai_raw_response')
        .eq('candidate_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle()
      app = data as Record<string, unknown> | null
    }

    const appId = app?.id as string | undefined

    // Idade: resposta do campo 'date' do formulário
    let idade: number | null = null
    let vaga = ''
    if (appId) {
      const { data: faRows } = await supabase
        .from('form_answers')
        .select('answer_text, form_questions(field_type)')
        .eq('application_id', appId)
      for (const fa of (faRows || []) as Array<Record<string, unknown>>) {
        const ft = (fa.form_questions as { field_type?: string } | null)?.field_type
        if (ft === 'date' && idade == null) idade = ageFrom(unquote(fa.answer_text as string | null))
        if (ft === 'job_select' && !vaga) vaga = unquote(fa.answer_text as string | null)
      }
    }

    // Vaga: prioriza o título da vaga vinculada (job_id); senão usa o job_select
    if (app?.job_id) {
      const { data: job } = await supabase.from('jobs').select('title').eq('id', app.job_id as string).maybeSingle()
      if (job?.title) vaga = job.title as string
    }
    // job_select pode ser um UUID — resolve para o título
    if (vaga && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(vaga)) {
      const { data: job } = await supabase.from('jobs').select('title').eq('id', vaga).maybeSingle()
      vaga = (job?.title as string) || vaga
    }
    if (!vaga) vaga = 'Não informada'

    // Parecer da IA
    let parecer = (app?.ai_recommendation as string | null) || ''
    if (!parecer) {
      const raw = app?.ai_raw_response as Record<string, unknown> | null
      parecer = (raw?.parecer_ia as string) || (raw?.resumo_candidato as string) || ''
    }
    if (!parecer) parecer = 'Análise de IA ainda não disponível para este candidato.'

    // ── Monta e envia a mensagem ──────────────────────────────────────────────
    const linhas = [
      `Olá ${recruiterName}, recebemos um currículo que vale a pena entrevistar.`,
      '',
      `*Nome:* ${candidate.full_name}`,
      `*Idade:* ${idade != null ? `${idade} anos` : 'Não informada'}`,
      `*Vaga:* ${vaga}`,
      '',
      `*Parecer da IA:*`,
      parecer,
    ]
    const message = linhas.join('\n')

    const sent = await sendWhatsAppRaw(recruiterPhone, message, 'notify_recruiter')
    if (!sent.ok) {
      return NextResponse.json({ error: `Falha ao enviar WhatsApp: ${sent.error}` }, { status: 502 })
    }

    return NextResponse.json({ ok: true, recruiter: recruiterName })
  } catch (err) {
    console.error('[notify-recruiter]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
