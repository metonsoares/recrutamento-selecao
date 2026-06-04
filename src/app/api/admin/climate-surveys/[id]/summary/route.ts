import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { getAnthropicKey, getOpenAIKey } from '@/lib/ai-key'

export const maxDuration = 30

interface QOption { text: string; weight: number }
interface Question { id: string; text: string; type?: 'texto' | 'multipla'; options: QOption[] }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { responseId } = await req.json()
    if (!responseId) return NextResponse.json({ error: 'responseId obrigatório.' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()
    const { data: survey } = await supabase.from('climate_surveys').select('title, questions, result_guide').eq('id', id).maybeSingle()
    if (!survey) return NextResponse.json({ error: 'Pesquisa não encontrada.' }, { status: 404 })
    const { data: resp } = await supabase.from('climate_responses').select('answers').eq('id', responseId).maybeSingle()
    if (!resp) return NextResponse.json({ error: 'Resposta não encontrada.' }, { status: 404 })

    const questions = (survey.questions as Question[]) || []
    const answers = (resp.answers as Record<string, number | string>) || {}

    const linhas = questions.map((q, i) => {
      const a = answers[q.id]
      if (q.type === 'texto') return `${i + 1}. ${q.text} => ${a ? String(a) : '(em branco)'}`
      const idx = typeof a === 'number' ? a : Number(a)
      const opt = q.options?.[idx]
      return `${i + 1}. ${q.text} => ${opt ? `${opt.text} (peso ${opt.weight})` : '(não respondida)'}`
    }).join('\n')

    const prompt = `Você é um especialista em RH. Com base no guia de interpretação e nas respostas de um
funcionário a uma pesquisa/teste, gere um RESUMO MUITO CURTO do resultado (no máximo 12 palavras),
no formato de rótulo do perfil/resultado predominante.
Exemplos de formato: "Linguagem Principal: Recompensas e Gestos Concretos", "Perfil: Engajado",
"Clima: Positivo — foco em reconhecimento".

Pesquisa: "${survey.title}"
${survey.result_guide ? `GUIA DE INTERPRETAÇÃO:\n"""\n${String(survey.result_guide).slice(0, 6000)}\n"""\n` : ''}
Respostas do funcionário:
${linhas}

Responda APENAS com o rótulo curto, sem aspas, sem pontuação final, sem explicação.`

    const anthropicKey = await getAnthropicKey()
    const openaiKey = await getOpenAIKey()
    let summary = ''

    if (anthropicKey) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 60, messages: [{ role: 'user', content: prompt }] }),
      })
      if (res.ok) { const d = await res.json(); summary = (d?.content?.[0]?.text || '').trim() }
    }
    if (!summary && openaiKey) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 60, messages: [{ role: 'user', content: prompt }] }),
      })
      if (res.ok) { const d = await res.json(); summary = (d?.choices?.[0]?.message?.content || '').trim() }
    }

    summary = summary.replace(/^["'\s]+|["'\s.]+$/g, '').slice(0, 120)
    return NextResponse.json({ summary })
  } catch (err) {
    console.error('[climate summary]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
