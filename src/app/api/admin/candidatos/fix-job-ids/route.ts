import { NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

/**
 * POST /api/admin/candidatos/fix-job-ids
 *
 * Para candidatos cujo applications.job_id está NULL,
 * procura a resposta do campo job_select em form_answers
 * e atualiza applications.job_id com o UUID encontrado.
 */
export async function POST() {
  try {
    const supabase = await createSupabaseServiceClient()

    // 1. Busca todos os question_ids do tipo job_select
    const { data: jobQuestions } = await supabase
      .from('form_questions')
      .select('id')
      .eq('field_type', 'job_select')

    const jobQuestionIds = (jobQuestions ?? []).map(q => q.id)
    if (jobQuestionIds.length === 0) {
      return NextResponse.json({ fixed: 0, message: 'Nenhuma questão job_select encontrada.' })
    }

    // 2. Busca respostas de job_select para candidaturas sem job_id
    const { data: answers } = await supabase
      .from('form_answers')
      .select('application_id, answer_text')
      .in('question_id', jobQuestionIds)
      .not('answer_text', 'is', null)

    if (!answers || answers.length === 0) {
      return NextResponse.json({ fixed: 0, message: 'Nenhuma resposta de vaga encontrada.' })
    }

    // 3. Para cada resposta, verifica se a candidatura ainda está sem job_id
    //    e se o valor parece um UUID válido (job_id)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    let fixed = 0
    for (const ans of answers) {
      const raw = ans.answer_text?.replace(/^"|"$/g, '') ?? ''
      if (!uuidRegex.test(raw)) continue

      const { data: app } = await supabase
        .from('applications')
        .select('id, job_id')
        .eq('id', ans.application_id)
        .maybeSingle()

      if (!app || app.job_id) continue // já tem job_id, pula

      const { error } = await supabase
        .from('applications')
        .update({ job_id: raw, updated_at: new Date().toISOString() })
        .eq('id', ans.application_id)

      if (!error) fixed++
    }

    return NextResponse.json({ fixed })
  } catch (err) {
    console.error('[fix-job-ids]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
