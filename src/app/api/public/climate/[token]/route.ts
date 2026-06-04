import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

interface QuestionOption { text: string; weight: number }
interface Question { id: string; text: string; type?: 'texto' | 'multipla'; options: QuestionOption[] }

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const { candidate_id, respondent_name, answers } = await req.json()

    const supabase = await createSupabaseServiceClient()
    const { data: survey } = await supabase
      .from('climate_surveys').select('id, questions, active').eq('token', token).maybeSingle()
    if (!survey || !survey.active) return NextResponse.json({ error: 'Pesquisa indisponível.' }, { status: 404 })

    // Todas as perguntas são de preenchimento obrigatório
    const questions = (survey.questions as Question[]) || []
    const faltando = questions.some(q => {
      const a = answers?.[q.id]
      if (q.type === 'texto') return a == null || !String(a).trim()
      return a == null
    })
    if (faltando) return NextResponse.json({ error: 'Responda todas as perguntas.' }, { status: 400 })

    // Calcula pontuação a partir dos pesos das opções escolhidas
    let total = 0, max = 0
    for (const q of questions) {
      const weights = q.options.map(o => Number(o.weight) || 0)
      max += weights.length ? Math.max(...weights) : 0
      const chosen = answers?.[q.id]
      if (chosen != null && q.options[chosen]) total += Number(q.options[chosen].weight) || 0
    }

    const { error } = await supabase.from('climate_responses').insert({
      survey_id: survey.id,
      candidate_id: candidate_id || null,
      respondent_name: respondent_name || null,
      answers: answers || {},
      total_score: total,
      max_score: max,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[public climate POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
