import { NextRequest, NextResponse } from 'next/server'
import mammoth from 'mammoth'

export const runtime = 'nodejs'
export const maxDuration = 30

function genId() { return (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now() + Math.random()) }

interface QOption { text: string; weight: number }
interface Question { id: string; text: string; type: 'texto' | 'multipla'; options: QOption[] }

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
    const parsed = parseSurvey(text)
    if (parsed.questions.length === 0) {
      return NextResponse.json({ error: 'Não foi possível identificar perguntas no arquivo. Verifique o formato.' }, { status: 422 })
    }
    return NextResponse.json(parsed)
  } catch (err) {
    console.error('[parse-docx]', err)
    return NextResponse.json({ error: 'Erro ao processar o arquivo.' }, { status: 500 })
  }
}
