import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { BackgroundCheckResult } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchResult {
  source: string
  snippets: string[]
  urls: string[]
  rawText?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, options: RequestInit = {}, ms = 12000): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...options, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// Extracts the first N chars around keyword matches in a large text block
function extractAround(text: string, keywords: RegExp, charsBefore = 200, charsAfter = 600, maxMatches = 4): string {
  const parts: string[] = []
  const matches = [...text.matchAll(new RegExp(keywords.source, 'gi'))]
  for (const m of matches.slice(0, maxMatches)) {
    const start = Math.max(0, (m.index ?? 0) - charsBefore)
    const end = Math.min(text.length, (m.index ?? 0) + charsAfter)
    parts.push('...' + text.slice(start, end) + '...')
  }
  return parts.join('\n')
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
}

// ─── Google Search ────────────────────────────────────────────────────────────

async function searchGoogle(query: string): Promise<SearchResult> {
  const source = 'Google'
  try {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=br&num=10`
    const res = await fetchWithTimeout(url, {
      headers: {
        ...BROWSER_HEADERS,
        'Referer': 'https://www.google.com.br/',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
      },
    }, 14000)

    if (!res.ok) return { source, snippets: [], urls: [] }

    const html = await res.text()

    // Extract organic result URLs — Google embeds them as /url?q=<url>&
    const urlMatches = [...html.matchAll(/\/url\?q=(https?:\/\/[^&"]+)&/gi)]
    const urls = urlMatches
      .map(m => decodeURIComponent(m[1]))
      .filter(u => !u.includes('google.com') && !u.includes('googleadservices'))
      .filter((u, i, arr) => arr.indexOf(u) === i) // dedupe
      .slice(0, 8)

    // Extract snippets — try multiple Google patterns
    const snippets: string[] = []

    // Pattern 1: data-content spans
    const p1 = [...html.matchAll(/<span[^>]*class="[^"]*MUxGbd[^"]*"[^>]*>([\s\S]*?)<\/span>/gi)]
    p1.forEach(m => { const t = stripHtml(m[1]).trim(); if (t.length > 30) snippets.push(t) })

    // Pattern 2: VwiC3b (Google snippet class)
    const p2 = [...html.matchAll(/<div[^>]*class="[^"]*VwiC3b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)]
    p2.forEach(m => { const t = stripHtml(m[1]).trim(); if (t.length > 30) snippets.push(t) })

    // Pattern 3: generic span with long text (fallback)
    if (snippets.length < 3) {
      const text = stripHtml(html)
      const relevant = extractAround(text, /processo|auxílio|bolsa|jusbrasil|escavador|trabalhista|criminal|cível/i)
      if (relevant) snippets.push(relevant.slice(0, 1500))
    }

    return {
      source,
      snippets: [...new Set(snippets)].slice(0, 8),
      urls,
    }
  } catch {
    return { source, snippets: [], urls: [] }
  }
}

// ─── DuckDuckGo HTML Search ───────────────────────────────────────────────────

async function searchDDG(query: string, sourceLabel: string): Promise<SearchResult> {
  try {
    const res = await fetchWithTimeout(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=br-pt`,
      { headers: { ...BROWSER_HEADERS } },
      12000,
    )
    if (!res.ok) return { source: sourceLabel, snippets: [], urls: [] }

    const html = await res.text()

    const snippets = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi)]
      .map(m => stripHtml(m[1]).trim())
      .filter(s => s.length > 20)
      .slice(0, 6)

    const urls = [...html.matchAll(/class="result__url"[^>]*>([\s\S]*?)<\/span>/gi)]
      .map(m => stripHtml(m[1]).trim())
      .filter(Boolean)
      .slice(0, 6)

    // Also extract title text for richer context
    const titles = [...html.matchAll(/class="result__a"[^>]*>([\s\S]*?)<\/a>/gi)]
      .map(m => stripHtml(m[1]).trim())
      .filter(t => t.length > 10)
      .slice(0, 6)

    // Merge title + snippet for richer context
    const combined = titles.map((t, i) => [t, snippets[i]].filter(Boolean).join(' — '))

    return { source: sourceLabel, snippets: combined.length ? combined : snippets, urls }
  } catch {
    return { source: sourceLabel, snippets: [], urls: [] }
  }
}

// ─── JusBrasil Direct Fetch ───────────────────────────────────────────────────

async function searchJusBrasil(name: string): Promise<SearchResult> {
  const source = 'JusBrasil'
  try {
    // Public process search
    const url = `https://www.jusbrasil.com.br/busca?q=${encodeURIComponent(`"${name}"`)}&s=processos`
    const res = await fetchWithTimeout(url, {
      headers: {
        ...BROWSER_HEADERS,
        'Referer': 'https://www.jusbrasil.com.br/',
      },
    }, 12000)

    if (!res.ok) return { source, snippets: [], urls: [url] }

    const html = await res.text()
    const text = stripHtml(html)

    // Extract relevant process info
    const snippets: string[] = []

    // JusBrasil result cards usually contain these keywords near process data
    const relevant = extractAround(text, /processo|ação|réu|autor|reclamante|reclamado|tribunal|vara|comarca/i, 100, 500, 5)
    if (relevant.trim().length > 50) snippets.push(relevant.slice(0, 2000))

    // If no relevant content found, take first 1500 chars of visible text
    if (!snippets.length) {
      const cleaned = text.replace(/\b(menu|footer|header|navigation|cookie|aceitar)\b.{0,200}/gi, '').slice(0, 1200)
      if (cleaned.length > 100) snippets.push(cleaned)
    }

    return { source, snippets, urls: [url] }
  } catch {
    return { source, snippets: [], urls: [] }
  }
}

// ─── Escavador Direct Fetch ───────────────────────────────────────────────────

async function searchEscavador(name: string): Promise<SearchResult> {
  const source = 'Escavador'
  try {
    const url = `https://www.escavador.com/busca?q=${encodeURIComponent(name)}&tipo=pessoas`
    const res = await fetchWithTimeout(url, {
      headers: {
        ...BROWSER_HEADERS,
        'Referer': 'https://www.escavador.com/',
      },
    }, 12000)

    if (!res.ok) return { source, snippets: [], urls: [url] }

    const html = await res.text()
    const text = stripHtml(html)

    const snippets: string[] = []
    const relevant = extractAround(text, /processo|ação|envolvido|parte|advogado|criminal|trabalhista|cível/i, 100, 500, 4)
    if (relevant.trim().length > 50) snippets.push(relevant.slice(0, 1500))

    if (!snippets.length && text.length > 100) {
      snippets.push(text.slice(0, 1000))
    }

    return { source, snippets, urls: [url] }
  } catch {
    return { source, snippets: [], urls: [] }
  }
}

// ─── Portal da Transparência ──────────────────────────────────────────────────

async function searchTransparencia(name: string, cpf: string | null): Promise<SearchResult> {
  const source = 'Portal da Transparência'
  try {
    // Try CPF first (more precise), fallback to name
    const termo = cpf
      ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
      : name

    const url = `https://portaldatransparencia.gov.br/beneficios/consulta?termo=${encodeURIComponent(termo)}&pagina=1`
    const res = await fetchWithTimeout(url, {
      headers: { ...BROWSER_HEADERS },
    }, 12000)

    if (!res.ok) return { source, snippets: [], urls: [url] }

    const html = await res.text()
    const text = stripHtml(html)

    const snippets: string[] = []
    const relevant = extractAround(text, /bolsa|benefício|auxílio|bpc|peti|programa|seguro.desemprego|cad[úu]nico/i, 200, 800, 5)
    if (relevant.trim().length > 50) snippets.push(relevant.slice(0, 2000))
    else snippets.push(text.slice(0, 1000))

    return { source, snippets, urls: [url] }
  } catch {
    return { source, snippets: [], urls: [] }
  }
}

// ─── Build AI Prompt ──────────────────────────────────────────────────────────

function buildPrompt(
  candidateName: string,
  cpf: string | null,
  city: string | null,
  results: SearchResult[],
): string {
  const cpfFormatted = cpf
    ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    : 'Não informado'

  const searchBlocks = results
    .map(r => {
      const hasData = r.snippets.length > 0 || r.urls.length > 0
      if (!hasData) return `\n═══ ${r.source.toUpperCase()} ═══\nNenhum resultado obtido desta fonte.\n`

      const urlList = r.urls.length ? `URLs encontradas:\n${r.urls.map(u => `  - ${u}`).join('\n')}` : ''
      const snippetList = r.snippets.length ? `Conteúdo extraído:\n${r.snippets.map(s => `  "${s}"`).join('\n')}` : ''

      return `\n═══ ${r.source.toUpperCase()} ═══\n${urlList}\n${snippetList}\n`
    })
    .join('')

  return `Você é um analista especializado em background check para processos seletivos no Brasil.

Analise TODOS os resultados abaixo com cuidado e produza um relatório completo sobre o candidato.

━━━ DADOS DO CANDIDATO ━━━
Nome completo: "${candidateName}"
CPF: ${cpfFormatted}
Cidade: ${city || 'Não informada'}

━━━ RESULTADOS DAS BUSCAS ━━━
${searchBlocks}

━━━ INSTRUÇÕES DE ANÁLISE ━━━

1. PROCESSOS JUDICIAIS (JusBrasil, Escavador, TJxxx, TRT, STJ, STF):
   - Identifique processos cíveis, criminais, trabalhistas, de família, etc.
   - Mencione número do processo, tribunal, tipo de ação se disponível
   - Confirme que o nome e/ou CPF correspondem ao candidato pesquisado
   - Diferencie se o candidato é autor, réu, reclamante ou reclamado

2. BENEFÍCIOS GOVERNAMENTAIS (Portal da Transparência, DataPrev, Caixa):
   - Bolsa Família / CadÚnico
   - BPC (Benefício de Prestação Continuada)
   - Seguro Desemprego
   - Auxílio Brasil, Auxílio Emergencial (COVID)
   - PETI, ProUni, FIES, outros programas sociais

3. OUTRAS INFORMAÇÕES RELEVANTES:
   - Registros em órgãos públicos (Receita Federal, TJSP, etc.)
   - Notícias em portais de mídia ou redes sociais relevantes para o cargo
   - Empresa(s) em que aparece como sócio ou representante
   - Qualquer outra informação pertinente para a contratação

4. CRITÉRIOS DE RIGOR:
   - Só afirme como "encontrado" o que tiver evidência EXPLÍCITA nos resultados
   - Se o nome for comum, indique a incerteza e se o CPF confirma a identidade
   - Se os sites não retornaram conteúdo útil, declare como "não verificado por limitação técnica"
   - Não invente nem suponha informações — baseie-se apenas no que foi coletado

Retorne APENAS um objeto JSON válido com esta estrutura:
{
  "processos_judiciais": {
    "encontrado": false,
    "resumo": "descrição clara em 1-2 frases",
    "detalhes": ["Processo nº XXXXX — Vara do Trabalho — 2023 (reclamante)", "..."],
    "urls": ["https://www.jusbrasil.com.br/..."]
  },
  "beneficios_governamentais": {
    "encontrado": false,
    "lista": ["Bolsa Família (ativo)", "Seguro Desemprego (2022)"],
    "resumo": "descrição clara"
  },
  "outras_informacoes": {
    "items": ["Sócia da empresa XYZ Ltda desde 2020", "..."],
    "resumo": "descrição clara ou 'Nenhuma informação adicional encontrada'"
  },
  "parecer_geral": "Resumo executivo em 2-3 frases para o recrutador decidir se há riscos",
  "nivel_risco": "baixo",
  "fontes_consultadas": ["Google", "JusBrasil", "Escavador", "Portal da Transparência"],
  "observacoes_tecnicas": "Ex: JusBrasil retornou página de login. Escavador não retornou resultados para este nome."
}

Valores válidos para nivel_risco: "baixo" | "medio" | "alto" | "nao_determinado"
Retorne SOMENTE o JSON, sem markdown, sem texto adicional.`
}

// ─── Call AI ──────────────────────────────────────────────────────────────────

async function callAI(
  prompt: string,
  supabase: Awaited<ReturnType<typeof createSupabaseServiceClient>>,
): Promise<BackgroundCheckResult> {
  const { data: aiSettings } = await supabase
    .from('ai_settings')
    .select('anthropic_api_key_encrypted, openai_api_key_encrypted')
    .limit(1)
    .single()

  // Try Anthropic (Haiku — fast and cheap for this task)
  if (aiSettings?.anthropic_api_key_encrypted) {
    try {
      const res = await fetchWithTimeout(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'x-api-key': aiSettings.anthropic_api_key_encrypted,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 2000,
            messages: [{ role: 'user', content: prompt }],
          }),
        },
        35000,
      )
      if (res.ok) {
        const data = await res.json()
        const text: string = data?.content?.[0]?.text || ''
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) return JSON.parse(jsonMatch[0]) as BackgroundCheckResult
      }
    } catch { /* fallthrough to OpenAI */ }
  }

  // Try OpenAI (gpt-4o-mini)
  if (aiSettings?.openai_api_key_encrypted) {
    try {
      const res = await fetchWithTimeout(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${aiSettings.openai_api_key_encrypted}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            max_tokens: 2000,
            response_format: { type: 'json_object' },
            messages: [{ role: 'user', content: prompt }],
          }),
        },
        35000,
      )
      if (res.ok) {
        const data = await res.json()
        const text: string = data?.choices?.[0]?.message?.content || ''
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) return JSON.parse(jsonMatch[0]) as BackgroundCheckResult
      }
    } catch { /* fallthrough */ }
  }

  return {
    processos_judiciais: { encontrado: false, resumo: 'Análise indisponível — configure uma chave de IA em Configurações → IA.', detalhes: [], urls: [] },
    beneficios_governamentais: { encontrado: false, lista: [], resumo: 'Análise indisponível.' },
    outras_informacoes: { items: [], resumo: 'Análise indisponível.' },
    parecer_geral: 'Nenhuma chave de IA configurada. Acesse Configurações → Configuração IA para adicionar.',
    nivel_risco: 'nao_determinado',
    fontes_consultadas: [],
    observacoes_tecnicas: 'Nenhuma chave de IA (Anthropic ou OpenAI) configurada.',
  }
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    // Auth
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

    const supabase = await createSupabaseServiceClient()

    // Fetch candidate
    const { data: candidate } = await supabase
      .from('candidates')
      .select('full_name, cpf, city, phone')
      .eq('id', id)
      .single()

    if (!candidate) return NextResponse.json({ error: 'Candidato não encontrado.' }, { status: 404 })

    const { full_name, cpf, city } = candidate
    const cpfClean = cpf?.replace(/\D/g, '') || null
    const cpfFormatted = cpfClean?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') ?? null

    // ── Fire all searches in parallel ─────────────────────────────────────────
    const [
      googleProcessos,
      googleBeneficios,
      googleGeral,
      jusBrasil,
      escavador,
      transparencia,
      ddgJusBrasil,
      ddgEscavador,
    ] = await Promise.allSettled([
      // Google: processos judiciais com nome exato
      searchGoogle(`"${full_name}" processos judiciais jusbrasil escavador`),
      // Google: benefícios e auxílios com CPF ou nome
      searchGoogle(`"${full_name}"${cpfFormatted ? ` OR "${cpfFormatted}"` : ''} auxílio bolsa dataprev INSS benefício governo`),
      // Google: busca geral sobre a pessoa
      searchGoogle(`"${full_name}"${city ? ` "${city}"` : ''} trabalhista criminal reclamação`),
      // JusBrasil direto
      searchJusBrasil(full_name),
      // Escavador direto
      searchEscavador(full_name),
      // Portal da Transparência
      searchTransparencia(full_name, cpfClean),
      // DuckDuckGo: JusBrasil site específico
      searchDDG(`"${full_name}" site:jusbrasil.com.br`, 'DuckDuckGo → JusBrasil'),
      // DuckDuckGo: Escavador + DataPrev
      searchDDG(`"${full_name}"${cpfFormatted ? ` OR "${cpfFormatted}"` : ''} site:escavador.com OR site:dataprev.gov.br OR site:mds.gov.br`, 'DuckDuckGo → Escavador/DataPrev'),
    ])

    const allResults: SearchResult[] = [
      googleProcessos.status    === 'fulfilled' ? googleProcessos.value    : { source: 'Google (processos)',   snippets: [], urls: [] },
      googleBeneficios.status   === 'fulfilled' ? googleBeneficios.value   : { source: 'Google (benefícios)',  snippets: [], urls: [] },
      googleGeral.status        === 'fulfilled' ? googleGeral.value        : { source: 'Google (geral)',       snippets: [], urls: [] },
      jusBrasil.status          === 'fulfilled' ? jusBrasil.value          : { source: 'JusBrasil',            snippets: [], urls: [] },
      escavador.status          === 'fulfilled' ? escavador.value          : { source: 'Escavador',            snippets: [], urls: [] },
      transparencia.status      === 'fulfilled' ? transparencia.value      : { source: 'Portal da Transparência', snippets: [], urls: [] },
      ddgJusBrasil.status       === 'fulfilled' ? ddgJusBrasil.value       : { source: 'DuckDuckGo → JusBrasil',  snippets: [], urls: [] },
      ddgEscavador.status       === 'fulfilled' ? ddgEscavador.value       : { source: 'DuckDuckGo → Escavador/DataPrev', snippets: [], urls: [] },
    ]

    // Build prompt and get AI analysis
    const prompt = buildPrompt(full_name, cpfClean, city, allResults)
    const result = await callAI(prompt, supabase)

    // Enrich URLs from direct fetches
    const directUrls = [
      ...allResults.flatMap(r => r.urls.filter(u =>
        u.includes('jusbrasil') || u.includes('escavador') || u.includes('dataprev') || u.includes('transparencia')
      )),
    ].filter((u, i, a) => a.indexOf(u) === i).slice(0, 6)

    if (directUrls.length > 0) {
      result.processos_judiciais.urls = [
        ...new Set([...(result.processos_judiciais.urls || []), ...directUrls]),
      ].slice(0, 6)
    }

    // List which sources actually returned data
    const activeSources = allResults
      .filter(r => r.snippets.length > 0 || r.urls.length > 0)
      .map(r => r.source)
    result.fontes_consultadas = activeSources.length > 0 ? activeSources : result.fontes_consultadas

    // Persist to DB
    await supabase
      .from('candidates')
      .update({
        background_check_result: result,
        background_check_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    return NextResponse.json({ success: true, result })
  } catch (err) {
    console.error('[background-check] error:', err)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}
