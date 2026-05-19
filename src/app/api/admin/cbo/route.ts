import { NextRequest, NextResponse } from 'next/server'
import { getAnthropicKey, getOpenAIKey } from '@/lib/ai-key'
import { lookupCbo, formatCboCode } from '@/lib/cbo-data'

interface CboResult {
  codigo: string
  titulo: string
  descricao: string
  encontrado: boolean
  fonte?: string
}

// ── 1. Tabela estática (lookup local) ─────────────────────────────────────────
function tryStaticLookup(digits: string): CboResult | null {
  const result = lookupCbo(digits)
  if (!result) return null
  return {
    codigo: result.codigo,
    titulo: result.titulo,
    descricao: result.descricao,
    encontrado: true,
    fonte: 'tabela',
  }
}

// ── 2. Scraping do site oficial cbo.mte.gov.br ────────────────────────────────
async function tryMteScrape(digits: string): Promise<CboResult | null> {
  const formatted = formatCboCode(digits)
  const BASE = 'https://cbo.mte.gov.br'
  const SEARCH_PAGE = `${BASE}/cbosite/pages/pesquisas/BuscaPorCodigo.jsf`

  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

  try {
    // ── Passo 1: buscar a página para obter cookies + ViewState ────────────
    const initRes = await fetch(SEARCH_PAGE, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    })
    if (!initRes.ok) return null

    const initHtml = await initRes.text()

    // Extrai cookies de sessão
    const setCookie = initRes.headers.get('set-cookie') || ''
    const cookies = setCookie.split(',').map(c => c.split(';')[0].trim()).join('; ')

    // Extrai ViewState (padrão JSF)
    const vsMatch =
      initHtml.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/) ||
      initHtml.match(/id="j_id[^"]*:javax\.faces\.ViewState[^"]*"[^>]*value="([^"]+)"/)
    if (!vsMatch) return null

    const viewState = vsMatch[1]
    const formIdMatch = initHtml.match(/<form[^>]+id="([^"]+)"/)
    const formId = formIdMatch?.[1] ?? 'formPesquisaCodigo'

    const codeFieldMatch =
      initHtml.match(/name="([^"]+)"[^>]*id="[^"]*[Cc]od[^"]*"/) ||
      initHtml.match(/id="([^"]*[Cc][Bb][Oo][^"]*)"/)
    const codeField = codeFieldMatch?.[1] ?? `${formId}:codCBO`

    const btnMatch =
      initHtml.match(/name="([^"]+)"[^>]+(?:type="submit"|value="Pesquisar")/) ||
      initHtml.match(/(?:type="submit"|value="Pesquisar")[^>]+name="([^"]+)"/)
    const btnField = btnMatch?.[1] ?? `${formId}:btnPesquisar`

    // ── Passo 2: enviar o formulário com o código ──────────────────────────
    const body = new URLSearchParams()
    body.set('javax.faces.ViewState', viewState)
    body.set(formId, formId)
    body.set(codeField, digits)
    body.set(btnField, 'Pesquisar')

    const postRes = await fetch(SEARCH_PAGE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': UA,
        'Cookie': cookies,
        'Referer': SEARCH_PAGE,
        'Origin': BASE,
      },
      body: body.toString(),
      signal: AbortSignal.timeout(10000),
    })
    if (!postRes.ok) return null

    const resultHtml = await postRes.text()
    if (!resultHtml.includes(digits) && !resultHtml.includes(formatted)) return null

    // Extrai título
    let titulo = ''
    const titlePatterns: RegExp[] = [
      /<(?:td|span|div)[^>]*class="[^"]*titulo[^"]*"[^>]*>\s*([^<]{4,100})\s*<\//i,
      /(?:T[íi]tulo|Denomina[çc][ãa]o)[^<]*<\/[^>]+>[^<]*<[^>]+>\s*([^<]{4,100})\s*</i,
      /Ocupa[çc][ãa]o[^<]*<\/[^>]+>[^<]*<[^>]+>\s*([^<]{4,100})\s*</i,
      new RegExp(digits.slice(0, 4) + '[-–]' + digits.slice(4) + '[^<]*<\\/[^>]+>[^<]*<[^>]+>\\s*([^<]{4,100})\\s*<'),
    ]
    for (const p of titlePatterns) {
      const m = resultHtml.match(p)
      if (m?.[1]) {
        const candidate = m[1].trim().replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
        if (candidate.length >= 4 && /[a-zA-ZÀ-ÿ]{2,}/.test(candidate)) {
          titulo = candidate
          break
        }
      }
    }
    if (!titulo) return null

    let descricao = ''
    const descPatterns: RegExp[] = [
      /Descri[çc][ãa]o[^<]*<\/[^>]+>[^<]*<[^>]+>\s*([^<]{20,500})\s*</i,
      /<(?:p|div|td)[^>]*class="[^"]*descricao[^"]*"[^>]*>\s*([^<]{20,500})\s*<\//i,
    ]
    for (const p of descPatterns) {
      const m = resultHtml.match(p)
      if (m?.[1]) {
        descricao = m[1].trim().replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
        break
      }
    }

    return { codigo: formatted, titulo, descricao, encontrado: true, fonte: 'mte' }
  } catch (e) {
    console.warn('[CBO MTE scrape] falhou:', (e as Error).message)
    return null
  }
}

// ── 3. Fallback via IA ────────────────────────────────────────────────────────
async function tryAI(formatted: string): Promise<CboResult | null> {
  const anthropicKey = await getAnthropicKey()
  const openaiKey = await getOpenAIKey()
  if (!anthropicKey && !openaiKey) return null

  const prompt = `Você é um especialista no CBO 2002 (Classificação Brasileira de Ocupações) do Ministério do Trabalho do Brasil.

Código consultado: ${formatted}

Exemplos de referência:
4221-05: Operador de caixa | 5141-05: Atendente de bar | 5131-05: Garçom | 7771-10: Confeiteiro
5211-05: Vendedor de comércio varejista | 1421-05: Gerente de loja | 4110-05: Auxiliar administrativo
7771-05: Padeiro | 5132-05: Cozinheiro geral | 5142-05: Auxiliar de cozinha

REGRA: Para código com formato válido (XXXX-XX), retorne SEMPRE "encontrado": true com o título mais próximo baseado na família ocupacional. Só retorne false se o formato for claramente inválido.

Responda SOMENTE com JSON válido (sem markdown, sem explicações):
{"codigo":"${formatted}","titulo":"Título oficial CBO 2002","descricao":"2-3 frases sobre as atividades típicas em português brasileiro","encontrado":true}`

  try {
    if (anthropicKey) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(15000),
      })
      const d = await r.json()
      if (d.error) {
        console.warn('[CBO AI Anthropic error]', d.error)
        return null
      }
      const text: string = d.content?.[0]?.text || ''
      const m = text.match(/\{[\s\S]*?\}/)
      if (m) return { ...JSON.parse(m[0]) as CboResult, fonte: 'ia' }

    } else if (openaiKey) {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 400,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(15000),
      })
      const d = await r.json()
      const text: string = d.choices?.[0]?.message?.content || ''
      if (text) return { ...JSON.parse(text) as CboResult, fonte: 'ia' }
    }
  } catch (e) {
    console.warn('[CBO AI fallback] falhou:', (e as Error).message)
  }
  return null
}

// ── Handler principal ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json()
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Código CBO obrigatório' }, { status: 400 })
    }

    const digits = code.replace(/\D/g, '')
    const formatted = formatCboCode(digits)

    if (digits.length < 5) {
      return NextResponse.json({ codigo: formatted, titulo: '', descricao: '', encontrado: false })
    }

    // 1ª tentativa: tabela estática local (rápida, sem rede)
    const staticResult = tryStaticLookup(digits)
    if (staticResult) return NextResponse.json(staticResult)

    // 2ª tentativa: site oficial do MTE (scraping JSF)
    const mteResult = await tryMteScrape(digits)
    if (mteResult) return NextResponse.json(mteResult)

    // 3ª tentativa: IA (se chave configurada)
    const aiResult = await tryAI(formatted)
    if (aiResult) return NextResponse.json(aiResult)

    return NextResponse.json({
      codigo: formatted,
      titulo: '',
      descricao: '',
      encontrado: false,
      mensagem: 'Código não localizado. Verifique se o código CBO está correto. Configure a chave de IA em Dados da Empresa para habilitar busca inteligente.',
    })
  } catch (err) {
    console.error('[CBO]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
