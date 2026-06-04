import { NextRequest, NextResponse } from 'next/server'
import mammoth from 'mammoth'
import { getAnthropicKey, getOpenAIKey } from '@/lib/ai-key'

export const runtime = 'nodejs'
export const maxDuration = 60

function genId() { return (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now() + Math.random()) }

interface QOption { text: string; weight: number }
interface Question { id: string; text: string; type: 'texto' | 'multipla'; options: QOption[] }

// ─── Interpretação por IA ──────────────────────────────────────────────────────

interface ParsedSurvey { title: string; description: string; questions: Question[] }

function buildAiPrompt(text: string): string {
  return `Você é um especialista em RH que estrutura pesquisas de clima organizacional.
Recebeu o conteúdo de um arquivo (extraído de um .docx) com uma pesquisa. Interprete-o e estruture-o
FIELMENTE, sem perder a essência nem o propósito do teste.

Regras:
- Identifique o título e a descrição/instruções, se houver.
- Extraia TODAS as perguntas na ordem original.
- Para cada pergunta, determine o tipo:
  - "multipla" = múltipla escolha (tem alternativas).
  - "texto" = resposta aberta (sem alternativas).
- Para perguntas de múltipla escolha, extraia as opções na ordem e atribua um "weight" (peso/nota) a cada opção:
  - Se o documento já indica pesos/notas, use-os.
  - Se NÃO houver pesos, atribua uma escala coerente com a intenção (ex: escala de satisfação:
    melhor opção = maior peso; pior = 0), distribuindo de forma proporcional (ex: 10, 7, 4, 0).
- NÃO invente perguntas que não existam. Preserve o texto original das perguntas e opções.

Conteúdo do arquivo:
"""
${text.slice(0, 12000)}
"""

Responda SOMENTE com JSON válido (sem markdown), no formato:
{
  "title": "string",
  "description": "string",
  "questions": [
    { "text": "string", "type": "multipla", "options": [ { "text": "string", "weight": 10 } ] },
    { "text": "string", "type": "texto", "options": [] }
  ]
}`
}

function normalize(parsed: unknown): ParsedSurvey | null {
  if (!parsed || typeof parsed !== 'object') return null
  const p = parsed as Record<string, unknown>
  const rawQs = Array.isArray(p.questions) ? p.questions : []
  const questions: Question[] = rawQs.map((q): Question => {
    const qq = q as Record<string, unknown>
    const type: 'texto' | 'multipla' = String(qq.type || '').toLowerCase().includes('texto') ? 'texto' : 'multipla'
    const opts = Array.isArray(qq.options) ? qq.options : []
    const options: QOption[] = opts.map((o) => {
      const oo = o as Record<string, unknown>
      return { text: String(oo.text ?? '').trim(), weight: Number(oo.weight) || 0 }
    }).filter(o => o.text)
    return {
      id: genId(),
      text: String(qq.text ?? '').trim(),
      type: (type === 'multipla' && options.length === 0) ? 'texto' : type,
      options: type === 'texto' ? [] : options,
    }
  }).filter(q => q.text)
  if (questions.length === 0) return null
  return { title: String(p.title ?? '').trim(), description: String(p.description ?? '').trim(), questions }
}

async function fetchTimeout(url: string, opts: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...opts, signal: ctrl.signal }) }
  finally { clearTimeout(t) }
}

async function interpretWithAI(text: string): Promise<ParsedSurvey | null> {
  const prompt = buildAiPrompt(text)
  const anthropicKey = await getAnthropicKey()
  const openaiKey = await getOpenAIKey()
  const TIMEOUT = 50000

  if (anthropicKey) {
    try {
      const res = await fetchTimeout('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 8000, messages: [{ role: 'user', content: prompt }] }),
      }, TIMEOUT)
      if (res.ok) {
        const d = await res.json()
        const t: string = d?.content?.[0]?.text || ''
        const m = t.match(/\{[\s\S]*\}/)
        if (m) { const n = normalize(JSON.parse(m[0])); if (n) return n }
      }
    } catch { /* fallback */ }
  }
  if (openaiKey) {
    try {
      const res = await fetchTimeout('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 8000, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }),
      }, TIMEOUT)
      if (res.ok) {
        const d = await res.json()
        const t: string = d?.choices?.[0]?.message?.content || ''
        const m = t.match(/\{[\s\S]*\}/)
        if (m) { const n = normalize(JSON.parse(m[0])); if (n) return n }
      }
    } catch { /* fallback */ }
  }
  return null
}

/**
 * Convenção esperada no .docx:
 * - Título: <texto>            (opcional)
 * - Descrição: <texto>         (opcional)
 * - Perguntas numeradas: "1. Pergunta...?" ou "Pergunta: ..."
 *   - Tipo opcional inline: [texto] ou [multipla]
 * - Opções: linhas começando com "-", "•", "*", "a)", "( )" ou "[ ]"
 *   - Peso opcional ao final: "(10)", "= 10" ou "peso 10"
 * - Perguntas sem opções viram campo de texto.
 */
function parseSurvey(text: string): { title: string; description: string; questions: Question[] } {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  let title = '', description = ''
  const questions: Question[] = []
  let current: Question | null = null

  const optionRe = /^([-*•·]|\(\s*\)|\[\s*\]|[a-eA-E][)\.]\s|o\s)/

  for (const raw of lines) {
    const lower = raw.toLowerCase()
    if (/^t[íi]tulo\s*[:\-]/.test(lower)) { title = raw.replace(/^[^:\-]*[:\-]\s*/, '').trim(); continue }
    if (/^(descri[çc][ãa]o|subt[íi]tulo)\s*[:\-]/.test(lower)) { description = raw.replace(/^[^:\-]*[:\-]\s*/, '').trim(); continue }
    if (/^(resultados?|pontua[çc][ãa]o)\s*[:\-]?$/i.test(lower)) { continue } // seção de resultados — ignora cabeçalho

    // Linha de opção
    if (optionRe.test(raw) && current) {
      let t = raw.replace(optionRe, '').trim()
      let weight = 0
      const wm = t.match(/\((\d+)\)\s*$/) || t.match(/\bpeso\s*[:=]?\s*(\d+)/i) || t.match(/\bnota\s*[:=]?\s*(\d+)/i) || t.match(/[=:]\s*(\d+)\s*$/)
      if (wm) { weight = Number(wm[1]); t = t.replace(wm[0], '').trim().replace(/[—\-–]\s*$/, '').trim() }
      if (t) { current.options.push({ text: t, weight }); current.type = 'multipla' }
      continue
    }

    // Linha "Tipo: texto/multipla"
    if (/^tipo\s*[:\-]/i.test(raw) && current) {
      current.type = /texto/i.test(raw) ? 'texto' : 'multipla'; continue
    }

    // Linha de pergunta
    let q = raw.replace(/^\d+\s*[)\.\-]\s*/, '').replace(/^pergunta\s*\d*\s*[:\-]?\s*/i, '').trim()
    let type: 'texto' | 'multipla' = 'multipla'
    const tm = q.match(/[\[(](texto|m[úu]ltipla|multipla|escolha)[\])]/i)
    if (tm) { type = /texto/i.test(tm[1]) ? 'texto' : 'multipla'; q = q.replace(tm[0], '').trim() }
    if (q) { current = { id: genId(), text: q, type, options: [] }; questions.push(current) }
  }

  // perguntas sem opções → campo de texto
  questions.forEach(q => { if (q.options.length === 0) q.type = 'texto' })
  return { title, description, questions }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Arquivo é obrigatório.' }, { status: 400 })
    if (!file.name.toLowerCase().endsWith('.docx')) return NextResponse.json({ error: 'Envie um arquivo .docx.' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const { value: text } = await mammoth.extractRawText({ buffer })
    if (!text || text.trim().length < 10) {
      return NextResponse.json({ error: 'Arquivo vazio ou ilegível.' }, { status: 422 })
    }

    // 1) Interpretação por IA (mantém a essência do teste)
    const aiResult = await interpretWithAI(text)
    if (aiResult) return NextResponse.json({ ...aiResult, source: 'ia' })

    // 2) Fallback: parser heurístico
    const parsed = parseSurvey(text)
    if (parsed.questions.length === 0) {
      return NextResponse.json({ error: 'Não foi possível identificar perguntas no arquivo. Verifique o formato ou configure uma chave de IA.' }, { status: 422 })
    }
    return NextResponse.json({ ...parsed, source: 'heuristico' })
  } catch (err) {
    console.error('[parse-docx]', err)
    return NextResponse.json({ error: 'Erro ao processar o arquivo.' }, { status: 500 })
  }
}
