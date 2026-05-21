import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { BackgroundCheckResult } from '@/types'
import { scrapeJusBrasilAuthenticated } from '@/lib/jusbrasil-scraper'

// Aumenta o tempo máximo da função serverless para 90s (requer Vercel Pro)
export const maxDuration = 90

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchResult {
  source: string
  snippets: string[]
  urls: string[]
}

// ─── Utilities ────────────────────────────────────────────────────────────────

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

/** Finds up to maxMatches occurrences of a keyword and returns surrounding text */
function extractAround(text: string, pattern: RegExp, before = 150, after = 500, maxMatches = 5): string {
  const parts: string[] = []
  const re = new RegExp(pattern.source, 'gi')
  let m: RegExpExecArray | null
  let count = 0
  while ((m = re.exec(text)) !== null && count < maxMatches) {
    const start = Math.max(0, m.index - before)
    const end = Math.min(text.length, m.index + after)
    parts.push(text.slice(start, end).trim())
    count++
  }
  return parts.join('\n---\n')
}

/** Extracts Brazilian process numbers (NNNNNNN-NN.NNNN.N.NN.NNNN) from text */
function extractProcessNumbers(text: string): string[] {
  return [...new Set(
    [...text.matchAll(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g)].map(m => m[0])
  )].slice(0, 15)
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
}

// ─── Google Search ────────────────────────────────────────────────────────────
// Returns snippets + ALL urls found (including JusBrasil profile links)

async function searchGoogle(query: string, label = 'Google'): Promise<SearchResult & { rawHtml?: string }> {
  try {
    const res = await fetchWithTimeout(
      `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=br&num=10`,
      {
        headers: {
          ...BROWSER_HEADERS,
          'Referer': 'https://www.google.com.br/',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
        },
      },
      14000,
    )
    if (!res.ok) return { source: label, snippets: [], urls: [] }

    const html = await res.text()

    // Extract all URLs from Google results (/url?q=<url>&)
    const urls = [...html.matchAll(/\/url\?q=(https?:\/\/[^&"]+)&/gi)]
      .map(m => { try { return decodeURIComponent(m[1]) } catch { return m[1] } })
      .filter(u => !u.includes('google.com') && !u.includes('googleapis'))
      .filter((u, i, a) => a.indexOf(u) === i)
      .slice(0, 10)

    const text = stripHtml(html)
    const snippets: string[] = []

    // Try common Google snippet patterns
    const p1 = [...html.matchAll(/<div[^>]*class="[^"]*VwiC3b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)]
    p1.slice(0, 6).forEach(m => { const t = stripHtml(m[1]).trim(); if (t.length > 30) snippets.push(t) })

    const p2 = [...html.matchAll(/<span[^>]*class="[^"]*MUxGbd[^"]*"[^>]*>([\s\S]*?)<\/span>/gi)]
    p2.slice(0, 6).forEach(m => { const t = stripHtml(m[1]).trim(); if (t.length > 30) snippets.push(t) })

    // Fallback: extract text near relevant keywords
    if (snippets.length < 2) {
      const rel = extractAround(text, /processo|jusbrasil|escavador|auxílio|benefício|trabalhista|criminal/i, 100, 400, 5)
      if (rel.trim().length > 50) snippets.push(rel.slice(0, 2000))
    }

    return { source: label, snippets: [...new Set(snippets)].slice(0, 8), urls, rawHtml: html }
  } catch {
    return { source: label, snippets: [], urls: [] }
  }
}

// ─── Fetch a JusBrasil page (profile or search result) ───────────────────────

async function fetchJusBrasilPage(url: string): Promise<{ snippets: string[]; processNumbers: string[] }> {
  try {
    const res = await fetchWithTimeout(url, {
      headers: {
        ...BROWSER_HEADERS,
        'Referer': 'https://www.google.com.br/',
      },
    }, 12000)
    if (!res.ok) return { snippets: [], processNumbers: [] }

    const html = await res.text()

    // Detect login wall (page too small or contains login CTAs without real content)
    if (html.length < 3000 && (html.includes('Faça login') || html.includes('cadastre-se'))) {
      return { snippets: ['Página exige login para visualizar detalhes completos.'], processNumbers: [] }
    }

    const text = stripHtml(html)
    const processNumbers = extractProcessNumbers(text)
    const snippets: string[] = []

    if (processNumbers.length > 0) {
      snippets.push(`Números de processo encontrados: ${processNumbers.join(' | ')}`)
    }

    const relevant = extractAround(
      text,
      /processo|ação|réu|autor|reclamante|reclamado|tribunal|vara|comarca|sentença|audiência|advogado/i,
      80, 500, 6,
    )
    if (relevant.trim().length > 60) snippets.push(relevant.slice(0, 2500))

    return { snippets, processNumbers }
  } catch {
    return { snippets: [], processNumbers: [] }
  }
}

// ─── JusBrasil — autenticado (scraper) + fallback Google ─────────────────────
// Estratégia primária: login na conta JusBrasil do usuário via Playwright e
// consulta direta na Consulta Processual por CPF e nome.
// Fallback: pipeline Google → perfil JusBrasil (sem autenticação).

async function searchJusBrasil(
  name: string,
  cpf: string | null,
  jbCredentials?: { email: string; password: string },
): Promise<SearchResult> {
  // ── Tentativa 1: scraper autenticado ────────────────────────────────────────
  const scraperResult = await scrapeJusBrasilAuthenticated(name, cpf, jbCredentials)

  if (scraperResult.success && scraperResult.content.length > 100) {
    console.log('[JusBrasil] Scraper autenticado OK')
    const urls: string[] = [
      ...(cpf
        ? [`https://www.jusbrasil.com.br/consulta-processual/?query=${cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}`]
        : []),
      `https://www.jusbrasil.com.br/consulta-processual/?query=${encodeURIComponent(name)}`,
    ]
    return {
      source: 'JusBrasil (conta autenticada)',
      snippets: [scraperResult.content],
      urls,
    }
  }

  // Loga motivo da falha para o console do servidor
  if (scraperResult.error) {
    console.warn('[JusBrasil] Scraper falhou, usando fallback Google:', scraperResult.error)
  }

  // ── Fallback: Google pipeline + fetch direto ─────────────────────────────
  const allSnippets: string[] = []
  const allUrls: string[] = []

  if (scraperResult.error) {
    // Avisa a IA que o acesso autenticado falhou
    allSnippets.push(`AVISO: Acesso autenticado ao JusBrasil falhou (${scraperResult.error}). Dados abaixo são de busca pública no Google.`)
  }

  const googleQueries = [
    ...(cpf ? [`"${cpf}" jusbrasil`] : []),
    `"${name}" jusbrasil processos`,
  ]

  const jbProfileUrls: string[] = []

  const googleResults = await Promise.allSettled(
    googleQueries.map(q => searchGoogle(q, 'Google → JusBrasil'))
  )

  for (const r of googleResults) {
    if (r.status !== 'fulfilled') continue
    allSnippets.push(...r.value.snippets)
    allUrls.push(...r.value.urls)
    const jbUrls = r.value.urls.filter(u =>
      u.includes('jusbrasil.com.br') &&
      !u.includes('/busca') &&
      (u.includes('/processos') || u.includes('/pessoas') || u.includes('/perfil'))
    )
    jbProfileUrls.push(...jbUrls)
  }

  const directSearchUrls = [
    ...(cpf ? [
      `https://www.jusbrasil.com.br/busca?q=${encodeURIComponent(cpf)}&s=processos`,
      `https://www.jusbrasil.com.br/consulta-processual/busca?q=${encodeURIComponent(cpf)}`,
    ] : []),
    `https://www.jusbrasil.com.br/busca?q=${encodeURIComponent(`"${name}"`)}&s=processos`,
  ]

  const uniqueJbUrls = [...new Set(jbProfileUrls)].slice(0, 3)
  const fetchTargets = uniqueJbUrls.length > 0 ? uniqueJbUrls : directSearchUrls.slice(0, 2)

  const pageFetches = await Promise.allSettled(fetchTargets.map(url => fetchJusBrasilPage(url)))
  for (const r of pageFetches) {
    if (r.status !== 'fulfilled') continue
    allSnippets.push(...r.value.snippets)
  }

  const finalUrls = [
    ...new Set([
      ...fetchTargets,
      ...allUrls.filter(u => u.includes('jusbrasil.com.br')),
    ])
  ].slice(0, 6)

  return {
    source: 'JusBrasil (busca pública)',
    snippets: [...new Set(allSnippets)].filter(s => s.length > 20).slice(0, 8),
    urls: finalUrls,
  }
}

// ─── Escavador — Google pipeline + direct ────────────────────────────────────

async function searchEscavador(name: string, cpf: string | null): Promise<SearchResult> {
  const allSnippets: string[] = []
  const allUrls: string[] = []

  // Google to find Escavador profile
  const googleQueries = [
    ...(cpf ? [`"${cpf}" escavador`] : []),
    `"${name}" escavador processos`,
  ]

  const escProfileUrls: string[] = []

  const googleResults = await Promise.allSettled(
    googleQueries.map(q => searchGoogle(q, 'Google → Escavador'))
  )

  for (const r of googleResults) {
    if (r.status !== 'fulfilled') continue
    allSnippets.push(...r.value.snippets)
    allUrls.push(...r.value.urls)
    escProfileUrls.push(...r.value.urls.filter(u => u.includes('escavador.com')))
  }

  // Direct Escavador fetch (fallback)
  const directUrl = cpf
    ? `https://www.escavador.com/busca?q=${encodeURIComponent(cpf)}&tipo=pessoas`
    : `https://www.escavador.com/busca?q=${encodeURIComponent(`"${name}"`)}&tipo=pessoas`

  const fetchTargets = [...new Set(escProfileUrls)].slice(0, 2)
  if (!fetchTargets.length) fetchTargets.push(directUrl)

  const pageFetches = await Promise.allSettled(fetchTargets.map(async url => {
    const res = await fetchWithTimeout(url, { headers: { ...BROWSER_HEADERS, 'Referer': 'https://www.google.com.br/' } }, 12000)
    if (!res.ok) return { snippets: [], processNumbers: [] }
    const html = await res.text()
    const text = stripHtml(html)
    const processNumbers = extractProcessNumbers(text)
    const snippets: string[] = []
    if (processNumbers.length > 0) snippets.push(`Processos no Escavador: ${processNumbers.join(' | ')}`)
    const rel = extractAround(text, /processo|envolvido|parte|criminal|trabalhista|cível/i, 80, 400, 4)
    if (rel.trim().length > 50) snippets.push(rel.slice(0, 1500))
    return { snippets, processNumbers }
  }))

  for (const r of pageFetches) {
    if (r.status === 'fulfilled') allSnippets.push(...r.value.snippets)
  }

  return {
    source: 'Escavador',
    snippets: [...new Set(allSnippets)].filter(s => s.length > 20).slice(0, 6),
    urls: [...new Set([...fetchTargets, ...allUrls.filter(u => u.includes('escavador.com'))])].slice(0, 4),
  }
}

// ─── Portal da Transparência ──────────────────────────────────────────────────

async function searchTransparencia(name: string, cpf: string | null): Promise<SearchResult> {
  const source = 'Portal da Transparência'
  try {
    const termo = cpf
      ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
      : name
    const url = `https://portaldatransparencia.gov.br/beneficios/consulta?termo=${encodeURIComponent(termo)}&pagina=1`
    const res = await fetchWithTimeout(url, { headers: { ...BROWSER_HEADERS } }, 12000)
    if (!res.ok) return { source, snippets: [], urls: [url] }
    const html = await res.text()
    const text = stripHtml(html)
    const rel = extractAround(text, /bolsa|benefício|auxílio|bpc|peti|cad[úu]nico|seguro.desemprego/i, 200, 800, 5)
    return {
      source,
      snippets: rel.trim().length > 50 ? [rel.slice(0, 2000)] : [text.slice(0, 1000)],
      urls: [url],
    }
  } catch {
    return { source, snippets: [], urls: [] }
  }
}

// ─── DuckDuckGo ───────────────────────────────────────────────────────────────

async function searchDDG(query: string, label: string): Promise<SearchResult> {
  try {
    const res = await fetchWithTimeout(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=br-pt`,
      { headers: { ...BROWSER_HEADERS } },
      12000,
    )
    if (!res.ok) return { source: label, snippets: [], urls: [] }
    const html = await res.text()

    const titles = [...html.matchAll(/class="result__a"[^>]*>([\s\S]*?)<\/a>/gi)]
      .map(m => stripHtml(m[1]).trim()).filter(t => t.length > 10).slice(0, 6)
    const snippets = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi)]
      .map(m => stripHtml(m[1]).trim()).filter(s => s.length > 20).slice(0, 6)
    const urls = [...html.matchAll(/class="result__url"[^>]*>([\s\S]*?)<\/span>/gi)]
      .map(m => stripHtml(m[1]).trim()).filter(Boolean).slice(0, 6)

    const combined = titles.map((t, i) => [t, snippets[i]].filter(Boolean).join(' — '))
    return { source: label, snippets: combined.length ? combined : snippets, urls }
  } catch {
    return { source: label, snippets: [], urls: [] }
  }
}

// ─── AI Prompt ────────────────────────────────────────────────────────────────

function buildPrompt(
  name: string,
  cpf: string | null,
  city: string | null,
  results: SearchResult[],
): string {
  const cpfFormatted = cpf?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') ?? 'Não informado'
  const usedCpfSearch = !!cpf

  const blocks = results
    .map(r => {
      if (!r.snippets.length && !r.urls.length) return `\n═══ ${r.source.toUpperCase()} ═══\nSem dados retornados.\n`
      const urlBlock = r.urls.length ? `URLs:\n${r.urls.map(u => `  • ${u}`).join('\n')}` : ''
      const snipBlock = r.snippets.length ? `Conteúdo:\n${r.snippets.map(s => `  "${s}"`).join('\n')}` : ''
      return `\n═══ ${r.source.toUpperCase()} ═══\n${urlBlock}\n${snipBlock}\n`
    })
    .join('')

  const jbAuthenticated = results.some(r => r.source.includes('autenticada'))

  return `Você é um analista especializado em background check para processos seletivos no Brasil.

━━━ CANDIDATO ━━━
Nome: "${name}"
CPF: ${cpfFormatted}${usedCpfSearch ? ' ← identificador único usado na busca (resultados vinculados a este CPF são 100% desta pessoa)' : ' (não disponível — busca por nome pode ter homonímia)'}
Cidade: ${city || 'Não informada'}

━━━ DADOS COLETADOS ━━━
${blocks}

━━━ INSTRUÇÕES ━━━

1. PROCESSOS JUDICIAIS:
   - Identifique processos cíveis, criminais, trabalhistas, de família, execução fiscal, etc.
   - Se encontrar números no formato NNNNNNN-NN.NNNN.N.NN.NNNN, liste todos explicitamente
   - Indique tribunal, vara, tipo de ação e papel (autor/réu/reclamante/reclamado) quando disponível
   - ${jbAuthenticated ? '✓ JusBrasil consultado com CONTA AUTENTICADA — dados são da consulta processual oficial' : 'JusBrasil acessado via busca pública (sem autenticação)'}
   - ${usedCpfSearch ? 'CPF foi usado como chave de busca — resultados são definitivamente desta pessoa' : 'Nome pode ter homonímia — avalie se os dados confirmam ser a mesma pessoa'}

2. BENEFÍCIOS GOVERNAMENTAIS:
   - Bolsa Família / CadÚnico, BPC, Seguro Desemprego, Auxílio Brasil, Auxílio Emergencial, PETI, etc.
   - Indique se ativo ou histórico (ano) quando disponível

3. OUTRAS INFORMAÇÕES:
   - Sociedade em empresas, notícias relevantes, registros públicos, dívidas ativas

4. RIGOR:
   - Só afirme como "encontrado: true" se há evidência explícita e concreta nos dados acima
   - Se o site retornou página de login ou sem resultados, escreva isso no resumo
   - Não invente — baseie-se APENAS nos dados coletados

Retorne SOMENTE este JSON (sem markdown):
{
  "processos_judiciais": {
    "encontrado": false,
    "resumo": "descrição objetiva",
    "detalhes": ["Processo 0001234-56.2023.8.19.0004 — TJRJ — Vara do Trabalho (reclamante)", "..."],
    "urls": ["https://www.jusbrasil.com.br/..."]
  },
  "beneficios_governamentais": {
    "encontrado": false,
    "lista": ["Bolsa Família (ativo)", "..."],
    "resumo": "descrição objetiva"
  },
  "outras_informacoes": {
    "items": ["Sócia da empresa XYZ desde 2020"],
    "resumo": "descrição ou 'Nenhuma informação adicional encontrada'"
  },
  "parecer_geral": "2-3 frases diretas para o recrutador",
  "nivel_risco": "baixo",
  "fontes_consultadas": ["JusBrasil", "Escavador", "Portal da Transparência"],
  "observacoes_tecnicas": "limitações encontradas, ex: JusBrasil exigiu login"
}
Valores válidos para nivel_risco: "baixo" | "medio" | "alto" | "nao_determinado"`
}

// ─── Call AI ──────────────────────────────────────────────────────────────────

async function callAI(prompt: string, supabase: Awaited<ReturnType<typeof createSupabaseServiceClient>>): Promise<BackgroundCheckResult> {
  const { data: s } = await supabase.from('ai_settings').select('anthropic_api_key_encrypted, openai_api_key_encrypted').limit(1).single()

  if (s?.anthropic_api_key_encrypted) {
    try {
      const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': s.anthropic_api_key_encrypted, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
      }, 35000)
      if (res.ok) {
        const data = await res.json()
        const text: string = data?.content?.[0]?.text || ''
        const m = text.match(/\{[\s\S]*\}/)
        if (m) return JSON.parse(m[0]) as BackgroundCheckResult
      }
    } catch { /* fallthrough */ }
  }

  if (s?.openai_api_key_encrypted) {
    try {
      const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${s.openai_api_key_encrypted}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 2000, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }),
      }, 35000)
      if (res.ok) {
        const data = await res.json()
        const text: string = data?.choices?.[0]?.message?.content || ''
        const m = text.match(/\{[\s\S]*\}/)
        if (m) return JSON.parse(m[0]) as BackgroundCheckResult
      }
    } catch { /* fallthrough */ }
  }

  return {
    processos_judiciais: { encontrado: false, resumo: 'Chave de IA não configurada.', detalhes: [], urls: [] },
    beneficios_governamentais: { encontrado: false, lista: [], resumo: 'Chave de IA não configurada.' },
    outras_informacoes: { items: [], resumo: 'Chave de IA não configurada.' },
    parecer_geral: 'Configure uma chave de IA em Configurações → Configuração IA para usar este recurso.',
    nivel_risco: 'nao_determinado',
    fontes_consultadas: [],
    observacoes_tecnicas: 'Nenhuma chave de IA configurada.',
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

    const supabase = await createSupabaseServiceClient()

    const { data: candidate } = await supabase
      .from('candidates').select('full_name, cpf, city').eq('id', id).single()
    if (!candidate) return NextResponse.json({ error: 'Candidato não encontrado.' }, { status: 404 })

    const { full_name, cpf, city } = candidate
    const cpfClean = cpf?.replace(/\D/g, '') || null
    const cpfFormatted = cpfClean?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') ?? null

    // ── Credenciais JusBrasil (DB → env var) ──────────────────────────────────
    const { data: aiSettings } = await supabase
      .from('ai_settings')
      .select('jusbrasil_email, jusbrasil_password')
      .limit(1)
      .single()

    const jbCredentials =
      aiSettings?.jusbrasil_email && aiSettings?.jusbrasil_password
        ? { email: aiSettings.jusbrasil_email, password: aiSettings.jusbrasil_password }
        : undefined // scraper vai tentar env vars

    // ── Run all searches in parallel ──────────────────────────────────────────
    // JusBrasil and Escavador each internally run Google + direct fetch (2 phases)
    // DuckDuckGo and Transparência run independently in parallel
    const [jusBrasilR, escavadorR, transparenciaR, ddgGeralR] = await Promise.allSettled([
      searchJusBrasil(full_name, cpfClean, jbCredentials),
      searchEscavador(full_name, cpfClean),
      searchTransparencia(full_name, cpfClean),
      searchDDG(
        `"${full_name}"${cpfFormatted ? ` OR "${cpfFormatted}"` : ''} auxílio bolsa dataprev INSS benefício governo`,
        'DuckDuckGo (benefícios)',
      ),
    ])

    const results: SearchResult[] = [
      jusBrasilR.status    === 'fulfilled' ? jusBrasilR.value    : { source: 'JusBrasil',                 snippets: [], urls: [] },
      escavadorR.status    === 'fulfilled' ? escavadorR.value    : { source: 'Escavador',                  snippets: [], urls: [] },
      transparenciaR.status=== 'fulfilled' ? transparenciaR.value: { source: 'Portal da Transparência',    snippets: [], urls: [] },
      ddgGeralR.status     === 'fulfilled' ? ddgGeralR.value     : { source: 'DuckDuckGo (benefícios)',     snippets: [], urls: [] },
    ]

    const prompt = buildPrompt(full_name, cpfClean, city, results)
    const result = await callAI(prompt, supabase)

    // Enrich process URLs with what we actually found
    const allFoundUrls = results.flatMap(r => r.urls.filter(u =>
      u.includes('jusbrasil') || u.includes('escavador') || u.includes('dataprev')
    )).filter((u, i, a) => a.indexOf(u) === i).slice(0, 6)

    result.processos_judiciais.urls = [
      ...new Set([...(result.processos_judiciais.urls || []), ...allFoundUrls])
    ].slice(0, 6)

    result.fontes_consultadas = results
      .filter(r => r.snippets.length > 0 || r.urls.length > 0)
      .map(r => r.source)

    await supabase.from('candidates').update({
      background_check_result: result,
      background_check_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', id)

    return NextResponse.json({ success: true, result })
  } catch (err) {
    console.error('[background-check]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
