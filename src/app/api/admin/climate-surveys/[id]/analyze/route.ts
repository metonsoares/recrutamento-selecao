import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { getAnthropicKey, getOpenAIKey } from '@/lib/ai-key'

export const maxDuration = 30

interface QOption { text: string; weight: number }
interface Question { id: string; text: string; options: QOption[] }

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createSupabaseServiceClient()
    const { data: survey } = await supabase.from('climate_surveys').select('*').eq('id', id).maybeSingle()
    if (!survey) return NextResponse.json({ error: 'Pesquisa não encontrada.' }, { status: 404 })
    const { data: responses } = await supabase.from('climate_responses').select('*').eq('survey_id', id)

    const questions = (survey.questions as Question[]) || []
    const total = (responses || []).length
    if (total === 0) return NextResponse.json({ analysis: 'Ainda não há respostas para esta pesquisa.' })

    // Estatística por pergunta
    const perQuestion = questions.map(q => {
      const maxW = q.options.length ? Math.max(...q.options.map(o => Number(o.weight) || 0)) : 0
      let soma = 0, respondidas = 0
      for (const r of responses || []) {
        const idx = (r.answers as Record<string, number>)?.[q.id]
        if (idx != null && q.options[idx]) { soma += Number(q.options[idx].weight) || 0; respondidas++ }
      }
      const media = respondidas ? soma / respondidas : 0
      const aderencia = maxW ? Math.round((media / maxW) * 100) : 0
      return { pergunta: q.text, media: Math.round(media * 10) / 10, aderencia }
    })

    const mediaGeral = Math.round(perQuestion.reduce((s, q) => s + q.aderencia, 0) / (perQuestion.length || 1))

    const prompt = `Você é um especialista em clima organizacional. Analise os resultados de uma pesquisa de clima.

Pesquisa: "${survey.title}"${survey.company_name ? ` — Empresa: ${survey.company_name}` : ''}
Total de respostas: ${total}
Aderência geral média: ${mediaGeral}%

Resultados por pergunta (aderência = quão próximo do peso máximo, 0-100%):
${perQuestion.map(q => `- "${q.pergunta}": ${q.aderencia}% (média ${q.media})`).join('\n')}
${survey.result_guide ? `\nGUIA DE INTERPRETAÇÃO DOS RESULTADOS (siga fielmente estes critérios ao classificar e recomendar):\n"""\n${String(survey.result_guide).slice(0, 8000)}\n"""\n` : ''}
Escreva uma análise objetiva em português (4-6 parágrafos curtos) com:
1. Diagnóstico geral do clima (positivo/atenção/crítico).
2. Pontos fortes (maiores aderências).
3. Pontos de atenção (menores aderências) e possíveis causas.
4. Recomendações práticas de RH para melhorar o clima.
Use linguagem direta para gestores. Não invente dados além dos fornecidos.`

    const anthropicKey = await getAnthropicKey()
    const openaiKey = await getOpenAIKey()
    let analysis = ''

    if (anthropicKey) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 1200, messages: [{ role: 'user', content: prompt }] }),
      })
      if (res.ok) { const d = await res.json(); analysis = d?.content?.[0]?.text || '' }
    }
    if (!analysis && openaiKey) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 1200, messages: [{ role: 'user', content: prompt }] }),
      })
      if (res.ok) { const d = await res.json(); analysis = d?.choices?.[0]?.message?.content || '' }
    }
    if (!analysis) analysis = 'Configure uma chave de IA em Configuração IA para gerar a análise automática. Indicadores numéricos disponíveis acima.'

    return NextResponse.json({ analysis, mediaGeral, total, perQuestion })
  } catch (err) {
    console.error('[climate analyze]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
