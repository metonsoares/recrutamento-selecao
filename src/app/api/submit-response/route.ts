import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isRateLimited, getClientIp } from '@/lib/rateLimit'
import type { AnswerSubmission } from '@/lib/types/database'

interface SubmitBody {
  survey_id: string
  respondent_id: string
  answers: AnswerSubmission[]
}

export async function POST(request: NextRequest) {
  // A2: rate limit — 10 requisições por IP a cada 5 minutos
  const ip = getClientIp(request.headers)
  if (isRateLimited(ip, 10, 5 * 60_000)) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Aguarde alguns minutos.' },
      { status: 429 }
    )
  }

  try {
    const body: SubmitBody = await request.json()
    const { survey_id, respondent_id, answers } = body

    if (!survey_id || !respondent_id) {
      return NextResponse.json(
        { error: 'Dados de identificação incompletos.' },
        { status: 400 }
      )
    }

    const supabase = await createAdminClient()

    // 1. Verifica se o respondente existe e pertence à pesquisa ativa
    const { data: respondent } = await supabase
      .from('respondents')
      .select('id, survey_id')
      .eq('id', respondent_id)
      .eq('survey_id', survey_id)
      .maybeSingle()

    if (!respondent) {
      return NextResponse.json(
        { error: 'Identificação inválida. Volte ao início e tente novamente.' },
        { status: 400 }
      )
    }

    // 2. Verifica se a pesquisa ainda está ativa
    const { data: survey } = await supabase
      .from('surveys')
      .select('id')
      .eq('id', survey_id)
      .eq('status', 'active')
      .maybeSingle()

    if (!survey) {
      return NextResponse.json(
        { error: 'Esta pesquisa já foi encerrada.' },
        { status: 409 }
      )
    }

    // 3. Verifica se o respondente já submeteu (UNIQUE respondent_id)
    const { data: existing } = await supabase
      .from('responses')
      .select('id')
      .eq('respondent_id', respondent_id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: 'Você já enviou sua resposta. Obrigado pela participação!' },
        { status: 409 }
      )
    }

    // 4. Cria o response (cabeçalho)
    const { data: response, error: responseError } = await supabase
      .from('responses')
      .insert({ survey_id, respondent_id })
      .select('id')
      .single()

    if (responseError || !response) {
      if (responseError?.code === '23505') {
        return NextResponse.json(
          { error: 'Você já enviou sua resposta.' },
          { status: 409 }
        )
      }
      // M2: logar apenas campos controlados
      console.error('[submit] Response insert error:', responseError?.code, responseError?.message)
      return NextResponse.json(
        { error: 'Erro ao registrar resposta.' },
        { status: 500 }
      )
    }

    // 5. Insere todas as respostas individuais
    if (answers.length > 0) {
      type AnswerRow = {
        response_id: string
        question_id: string
        option_id: string | null
        answer_text: string | null
        answer_number: number | null
      }

      const answerRows: AnswerRow[] = answers.flatMap((ans): AnswerRow[] => {
        // M4: validar answer_text — máx 5000 caracteres
        if (ans.answer_text && ans.answer_text.length > 5000) {
          return []
        }

        // M4: validar answer_number — deve ser número finito
        if (ans.answer_number != null && !Number.isFinite(ans.answer_number)) {
          return []
        }

        if (ans.option_ids && ans.option_ids.length > 0) {
          return ans.option_ids.map((optId) => ({
            response_id: response.id,
            question_id: ans.question_id,
            option_id: optId,
            answer_number: ans.answer_number ?? null,
            answer_text: null,
          }))
        }
        return [
          {
            response_id: response.id,
            question_id: ans.question_id,
            option_id: null,
            answer_text: ans.answer_text?.trim() ?? null,
            answer_number: ans.answer_number ?? null,
          },
        ]
      })

      if (answerRows.length > 0) {
        const { error: answersError } = await supabase
          .from('answers')
          .insert(answerRows)

        if (answersError) {
          console.error('[submit] Answers insert error:', answersError.code, answersError.message)
          return NextResponse.json(
            { error: 'Erro ao salvar respostas.' },
            { status: 500 }
          )
        }
      }
    }

    return NextResponse.json({ success: true, response_id: response.id })
  } catch (err) {
    console.error('[submit] Unexpected error:', err instanceof Error ? err.message : 'unknown')
    return NextResponse.json(
      { error: 'Erro interno do servidor.' },
      { status: 500 }
    )
  }
}
