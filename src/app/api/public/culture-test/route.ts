import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { calculateCultureScore } from '@/lib/helpers'

export async function POST(req: NextRequest) {
  try {
    const { token, answers } = await req.json()
    if (!token || !answers) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()

    const { data: application } = await supabase
      .from('applications')
      .select('id, candidate_id')
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

    await supabase.from('applications').update({
      status: 'teste_cultural_preenchido',
      culture_score: cultureScore,
      updated_at: new Date().toISOString(),
    }).eq('id', application.id)

    // Trigger AI analysis async (fire and forget)
    fetch(`${process.env.APP_URL || 'http://localhost:3000'}/api/admin/ai/analyze-candidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal': process.env.ENCRYPTION_SECRET || '' },
      body: JSON.stringify({ applicationId: application.id }),
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
