import { NextRequest, NextResponse } from 'next/server'
import { getAnthropicKey, getOpenAIKey } from '@/lib/ai-key'

interface CboResult {
  codigo: string
  titulo: string
  descricao: string
  encontrado: boolean
  fonte?: string
}

function formatCode(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 6)
  return d.length >= 5 ? d.slice(0, 4) + '-' + d.slice(4) : d
}

// ── 1. Scraping do site oficial cbo.mte.gov.br ────────────────────────────────
async function tryMteScrape(digits: string): Promise<CboResult | null> {
  const formatted = formatCode(digits)
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
      signal: AbortSignal.timeout(12000),
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
    if (!vsMatch) {
      console.warn('[CBO] ViewState não encontrado — HTML do MTE pode ter mudado')
      return null
    }
    const viewState = vsMatch[1]

    // Identifica o nome do formulário JSF (ex: "j_idt12")
    const formIdMatch = initHtml.match(/<form[^>]+id="([^"]+)"/)
    const formId = formIdMatch?.[1] ?? 'formPesquisaCodigo'

    // Identifica o campo de código (tenta vários padrões)
    const codeFieldMatch =
      initHtml.match(/name="([^"]+)"[^>]*id="[^"]*[Cc]od[^"]*"/) ||
      initHtml.match(/id="([^"]*[Cc][Bb][Oo][^"]*)"/) ||
      initHtml.match(/name="([^"]+)"[^>]*placeholder="[^"]*[Cc][Oo][Dd]/)
    const codeField = codeFieldMatch?.[1] ?? `${formId}:codCBO`

    // Identifica o botão de submit
    const btnMatch =
      initHtml.match(/name="([^"]+)"[^>]+(?:type="submit"|value="Pesquisar")/) ||
      initHtml.match(/(?:type="submit"|value="Pesquisar")[^>]+name="([^"]+)"/)
    const btnField = btnMatch?.[1] ?? `${formId}:btnPesquisar`

    // ── Passo 2: enviar o formulário com o código ──────────────────────────
    const body = new URLSearchParams()
    body.set('javax.faces.ViewState', viewState)
    body.set(formId, formId)
    body.set(codeField, digits)         // código sem hífen (ex: "422105")
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
      signal: AbortSignal.timeout(12000),
    })
    if (!postRes.ok) return null

    const resultHtml = await postRes.text()

    // ── Passo 3: extrair título e descrição da página de resultado ─────────
    // Verifica se o código aparece no resultado
    if (!resultHtml.includes(digits) && !resultHtml.includes(formatted)) return null

    // Tenta extrair o título com múltiplos padrões de HTML
    let titulo = ''
    const titlePatterns: RegExp[] = [
      // Padrão: <td> ou <span> com classe "titulo"
      /<(?:td|span|div)[^>]*class="[^"]*titulo[^"]*"[^>]*>\s*([^<]{4,100})\s*<\//i,
      // Padrão: campo "Título" ou "Denominação" seguido do valor
      /(?:T[íi]tulo|Denomina[çc][ãa]o)[^<]*<\/[^>]+>[^<]*<[^>]+>\s*([^<]{4,100})\s*</i,
      // Padrão: "Ocupação" seguido do título
      /Ocupa[çc][ãa]o[^<]*<\/[^>]+>[^<]*<[^>]+>\s*([^<]{4,100})\s*</i,
      // Padrão: linha da tabela com o código + título na célula seguinte
      new RegExp(digits.slice(0, 4) + '[-–]' + digits.slice(4) + '[^<]*<\\/[^>]+>[^<]*<[^>]+>\\s*([^<]{4,100})\\s*<'),
      // Padrão genérico: texto após o código formatado na página
      new RegExp(formatted.replace('-', '[-–]') + '[^<]*<\\/[^>]+>[^<]*<[^>]+>\\s*([a-zA-ZÀ-ÿ][^<]{3,80})\\s*<'),
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

    // Tenta extrair a descrição
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
    console.error('[CBO MTE scrape]', e)
    return null
  }
}

// ── 2. Fallback via IA ────────────────────────────────────────────────────────
async function tryAI(formatted: string): Promise<CboResult | null> {
  const anthropicKey = await getAnthropicKey()
  const openaiKey = await getOpenAIKey()
  if (!anthropicKey && !openaiKey) return null

  const prompt = `Você é um especialista no CBO 2002 (Classificação Brasileira de Ocupações) do Ministério do Trabalho do Brasil.

Código consultado: ${formatted}

Exemplos de referência:
4221-05: Operador de caixa | 5141-05: Atendente de bar | 5131-05: Garçom | 7771-10: Padeiro e confeiteiro
5211-05: Vendedor de comércio varejista | 1421-05: Gerente de loja | 4110-05: Auxiliar administrativo

REGRA: Para código com formato válido (XXXX-XX), retorne SEMPRE "encontrado": true com o título mais provável baseado na família ocupacional. Só retorne false se o formato for claramente inválido.

Responda SOMENTE com JSON válido:
{"codigo":"${formatted}","titulo":"Título oficial CBO 2002","descricao":"2-3 frases sobre as atividades em português","encontrado":true}`

  try {
    if (anthropicKey) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
        signal: AbortSignal.timeout(15000),
      })
      const d = await r.json()
      if (d.error) return null
      const text: string = d.content?.[0]?.text || ''
      const m = text.match(/\{[\s\S]*?\}/)
      if (m) return { ...JSON.parse(m[0]) as CboResult, fonte: 'ia' }
    } else if (openaiKey) {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 400, response_format: { type: 'json_object' } }),
        signal: AbortSignal.timeout(15000),
      })
      const d = await r.json()
      const text: string = d.choices?.[0]?.message?.content || ''
      if (text) return { ...JSON.parse(text) as CboResult, fonte: 'ia' }
    }
  } catch (e) {
    console.error('[CBO AI fallback]', e)
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
    const formatted = formatCode(digits)

    if (digits.length < 5) {
      return NextResponse.json({ codigo: formatted, titulo: '', descricao: '', encontrado: false })
    }

    // 1ª tentativa: site oficial do MTE
    const mteResult = await tryMteScrape(digits)
    if (mteResult) return NextResponse.json(mteResult)

    // 2ª tentativa: IA (se chave configurada)
    const aiResult = await tryAI(formatted)
    if (aiResult) return NextResponse.json(aiResult)

    return NextResponse.json({
      codigo: formatted,
      titulo: '',
      descricao: '',
      encontrado: false,
      mensagem: 'Não foi possível localizar o código no site do MTE. Configure a chave de IA em Dados da Empresa para habilitar a busca alternativa.',
    })
  } catch (err) {
    console.error('[CBO]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
