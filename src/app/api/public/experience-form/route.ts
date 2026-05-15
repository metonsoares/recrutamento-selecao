import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { generateToken } from '@/lib/helpers'

export async function POST(req: NextRequest) {
  try {
    const { token, answers } = await req.json()
    if (!token || !answers) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()

    const { data: application } = await supabase
      .from('applications')
      .select('id, candidate_id, status')
      .eq('experience_form_token', token)
      .gte('experience_form_token_expires_at', new Date().toISOString())
      .single()

    if (!application) return NextResponse.json({ error: 'Token inválido ou expirado' }, { status: 400 })

    const rows = Object.entries(answers).map(([question_id, answer_text]) => ({
      application_id: application.id,
      question_id,
      answer_text: String(answer_text),
    }))

    if (rows.length > 0) {
      await supabase.from('form_answers').insert(rows)
    }

    const cultureToken = generateToken()
    const cultureExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    await supabase.from('applications').update({
      status: 'experiencia_preenchida',
      culture_test_token: cultureToken,
      culture_test_token_expires_at: cultureExpires,
      updated_at: new Date().toISOString(),
    }).eq('id', application.id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
