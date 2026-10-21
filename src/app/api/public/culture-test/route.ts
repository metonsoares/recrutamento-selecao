import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { calculateCultureScore, calculateFinalScore } from '@/lib/helpers'
import { enfileirarEProcessar } from '@/lib/fila-ia'

export async function POST(req: NextRequest) {
  try {
    const { token, answers } = await req.json()
    if (!token || !answers) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()

    const { data: application } = await supabase
      .from('applications')
      .select('id, candidate_id, experience_score, availability_score')
      .eq('culture_test_token', token)
      .gte('culture_test_token_expires_at', new Date().toISOString())
      .single()

    if (!application) return NextResponse.json({ error: 'Token inválido ou expirado' }, { status: 400 })

    const { data: questions } = await supabase
      .from('culture_questions')
      .select('id, scores, weight')
      .in('id', Object.keys(answers))

    const answerRows: Array<{ application_id: string; question_id: string; selected_option: string; score: number }> = []
    const scoreDetails: Array<{ score: number; weight: number }> = []

    for (const q of (questions || [])) {
      const selectedLetter = answers[q.id]
      const scores = q.scores as Record<string, number>
      const score = scores?.[selectedLetter] ?? 0
      answerRows.push({
        application_id: application.id,
        question_id: q.id,
        selected_option: selectedLetter,
        score,
      })
      scoreDetails.push({ score, weight: q.weight || 1 })
    }

    if (answerRows.length > 0) {
      await supabase.from('culture_answers').insert(answerRows)
    }

    const cultureScore = calculateCultureScore(scoreDetails)

    // A nota final TAMBÉM é refeita aqui. Antes esta rota gravava só a nota
    // cultural, e a `final_score` continuava a que a análise tinha calculado
    // ANTES do teste existir — ou seja, com cultura zero. Resultado: 28
    // candidaturas com nota final 23 a 48 pontos abaixo do real, uma delas de
    // pessoa já contratada (migration 033 consertou o passado).
    const notaFinal = calculateFinalScore(
      cultureScore,
      Number(application.experience_score) || 0,
      Number(application.availability_score) || 0,
    )

    await supabase.from('applications').update({
      status: 'teste_cultural_preenchido',
      culture_score: cultureScore,
      final_score: notaFinal,
      updated_at: new Date().toISOString(),
    }).eq('id', application.id)

    // Pede a reanálise pela FILA, agora que o teste cultural existe. O job é
    // o mesmo da etapa do currículo quando ele ainda está vivo (índice único
    // parcial), então não saem duas análises para a mesma pessoa.
    await enfileirarEProcessar(application.id, 'teste_cultural')

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
