import type { SupabaseClient } from '@supabase/supabase-js'
import { getAnthropicKey, getOpenAIKey } from './ai-key'

interface QOption { text: string; weight: number }
interface Question { id: string; text: string; type?: 'texto' | 'multipla'; options: QOption[] }

/**
 * Gera a interpretação individual da IA para uma resposta de pesquisa de clima
 * e grava o resultado em climate_responses (ai_interpretation / ai_interpreted_at).
 * Retorna o texto gerado, ou null se não foi possível interpretar.
 */
export async function interpretClimateResponse(
  supabase: SupabaseClient,
  surveyId: string,
  responseId: string,
): Promise<string | null> {
  const { data: survey } = await supabase.from('climate_surveys').select('*').eq('id', surveyId).maybeSingle()
  if (!survey) return null
  const { data: resp } = await supabase.from('climate_responses').select('*').eq('id', responseId).maybeSingle()
  if (!resp) return null

  let nome = 'Anônimo'
  if (resp.candidate_id) {
    const { data: c } = await supabase.from('candidates').select('full_name').eq('id', resp.candidate_id).maybeSingle()
    if (c?.full_name) nome = c.full_name as string
  }

  const questions = (survey.questions as Question[]) || []
  const answers = (resp.answers as Record<string, number | string>) || {}

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

  const withTimeout = (ms: number) => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), ms)
    return { signal: ctrl.signal, done: () => clearTimeout(t) }
  }

  if (anthropicKey) {
    const to = withTimeout(28000)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: to.signal,
        headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }),
      })
      if (res.ok) { const d = await res.json(); analysis = d?.content?.[0]?.text || '' }
    } catch { /* timeout/erro → tenta OpenAI */ } finally { to.done() }
  }
  if (!analysis && openaiKey) {
    const to = withTimeout(28000)
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', signal: to.signal,
        headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }),
      })
      if (res.ok) { const d = await res.json(); analysis = d?.choices?.[0]?.message?.content || '' }
    } catch { /* ignore */ } finally { to.done() }
  }

  if (!analysis) return null

  await supabase.from('climate_responses')
    .update({ ai_interpretation: analysis, ai_interpreted_at: new Date().toISOString() })
    .eq('id', responseId)

  return analysis
}
