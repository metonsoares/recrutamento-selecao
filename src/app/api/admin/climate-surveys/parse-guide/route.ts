import { NextRequest, NextResponse } from 'next/server'
import mammoth from 'mammoth'
import { getAnthropicKey, getOpenAIKey } from '@/lib/ai-key'

export const runtime = 'nodejs'
export const maxDuration = 60

async function fetchTimeout(url: string, opts: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...opts, signal: ctrl.signal }) }
  finally { clearTimeout(t) }
}

function buildPrompt(text: string, questionsText: string): string {
  return `Você é um especialista em RH e psicometria. Recebeu um documento com as INSTRUÇÕES de como
interpretar e gerar os RESULTADOS de uma pesquisa/teste de clima organizacional (como pontuar, faixas
de resultado, perfis, o que cada faixa significa, recomendações etc.).

${questionsText ? `Para contexto, estas são as perguntas da pesquisa:\n${questionsText}\n` : ''}
Documento com as instruções de interpretação dos resultados:
"""
${text.slice(0, 12000)}
"""

Sua tarefa: transformar essas instruções em um GUIA DE INTERPRETAÇÃO claro, objetivo e fiel ao documento,
que será usado por uma IA para analisar CADA formulário preenchido e gerar o resultado individual e o
resultado geral da empresa. NÃO invente critérios que não estejam no documento; apenas organize e
explicite o que está descrito.

Inclua, quando existir no documento:
- Como calcular/pontuar as respostas.
- Faixas de pontuação e o significado de cada faixa (perfis, níveis de clima, etc.).
- Como classificar o resultado individual de cada funcionário.
- Como consolidar o resultado geral da empresa.
- Recomendações associadas a cada faixa/perfil, se houver.

Responda em português, em formato de texto organizado (use tópicos e títulos com markdown simples).
Seja completo mas conciso. Não acrescente comentários fora do guia.`
}

async function interpret(text: string, questionsText: string): Promise<string | null> {
  const prompt = buildPrompt(text, questionsText)
  const anthropicKey = await getAnthropicKey()
  const openaiKey = await getOpenAIKey()
  const TIMEOUT = 50000

  if (anthropicKey) {
    try {
      const res = await fetchTimeout('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }),
      }, TIMEOUT)
      if (res.ok) { const d = await res.json(); const t = d?.content?.[0]?.text || ''; if (t.trim()) return t.trim() }
    } catch { /* fallback */ }
  }
  if (openaiKey) {
    try {
      const res = await fetchTimeout('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }),
      }, TIMEOUT)
      if (res.ok) { const d = await res.json(); const t = d?.choices?.[0]?.message?.content || ''; if (t.trim()) return t.trim() }
    } catch { /* fallback */ }
  }
  return null
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const questionsText = (formData.get('questions') as string) || ''
    if (!file) return NextResponse.json({ error: 'Arquivo é obrigatório.' }, { status: 400 })
    if (!file.name.toLowerCase().endsWith('.docx')) return NextResponse.json({ error: 'Envie um arquivo .docx.' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const { value: text } = await mammoth.extractRawText({ buffer })
    if (!text || text.trim().length < 10) {
      return NextResponse.json({ error: 'Arquivo vazio ou ilegível.' }, { status: 422 })
    }

    const guide = await interpret(text, questionsText)
    if (guide) return NextResponse.json({ guide, source: 'ia' })

    // Fallback: usa o texto bruto como guia
    return NextResponse.json({ guide: text.trim().slice(0, 8000), source: 'bruto' })
  } catch (err) {
    console.error('[parse-guide]', err)
    return NextResponse.json({ error: 'Erro ao processar o arquivo.' }, { status: 500 })
  }
}
