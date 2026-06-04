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
    const { data: survey } = await supabase.from('climate_surveys').select('*').eq('id', id).maybeSingle()
    if (!survey) return NextResponse.json({ error: 'Pesquisa não encontrada.' }, { status: 404 })
    const { data: resp } = await supabase.from('climate_responses').select('*').eq('id', responseId).maybeSingle()
    if (!resp) return NextResponse.json({ error: 'Resposta não encontrada.' }, { status: 404 })

    let nome = 'Anônimo'
    if (resp.candidate_id) {
      const { data: c } = await supabase.from('candidates').select('full_name').eq('id', resp.candidate_id).maybeSingle()
      if (c?.full_name) nome = c.full_name
    }

    const questions = (survey.questions as Question[]) || []
    const answers = (resp.answers as Record<string, number | string>) || {}

    // Monta o detalhamento das respostas deste funcionário
    const linhas = questions.map((q, i) => {
      const a = answers[q.id]
      if (q.type === 'texto') {
        return `${i + 1}. ${q.text}\n   Resposta (texto): ${a ? String(a) : '(em branco)'}`
      }
      const idx = typeof a === 'number' ? a : Number(a)
      const opt = q.options?.[idx]
      return `${i + 1}. ${q.text}\n   Resposta: ${opt ? `${opt.text} (peso ${opt.weight})` : '(não respondida)'}`
    }).join('\n')

    const pct = resp.max_score ? Math.round(((resp.total_score || 0) / resp.max_score) * 100) : null

    const prompt = `Você é um especialista em clima organizacional e avaliação de pessoas.
Analise o resultado INDIVIDUAL de um funcionário que respondeu a uma pesquisa/teste.

Pesquisa: "${survey.title}"${survey.company_name ? ` — Empresa: ${survey.company_name}` : ''}
Funcionário: ${nome}
${pct != null ? `Pontuação obtida: ${resp.total_score || 0} de ${resp.max_score} (${pct}%)` : ''}

${survey.result_guide ? `GUIA DE INTERPRETAÇÃO DOS RESULTADOS (siga fielmente estes critérios):
"""
${String(survey.result_guide).slice(0, 8000)}
"""
` : 'Não há guia de interpretação específico; use boas práticas de RH.'}

Respostas do funcionário:
${linhas}

Com base ESTRITAMENTE no guia acima (quando houver) e nas respostas, escreva uma análise individual
objetiva em português (3-5 parágrafos curtos): classifique o resultado/perfil conforme o guia, destaque
pontos fortes e de atenção e dê recomendações práticas. Não invente critérios fora do guia.`

    const anthropicKey = await getAnthropicKey()
    const openaiKey = await getOpenAIKey()
    let analysis = ''

    if (anthropicKey) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }),
      })
      if (res.ok) { const d = await res.json(); analysis = d?.content?.[0]?.text || '' }
    }
    if (!analysis && openaiKey) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }),
      })
      if (res.ok) { const d = await res.json(); analysis = d?.choices?.[0]?.message?.content || '' }
    }
    if (!analysis) analysis = 'Configure uma chave de IA em Configuração IA para gerar a análise individual.'

    return NextResponse.json({ analysis })
  } catch (err) {
    console.error('[climate analyze-response]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
