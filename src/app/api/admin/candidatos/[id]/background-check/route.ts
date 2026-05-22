import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { BackgroundCheckResult } from '@/types'

// Tempo máximo adequado para HTTP puro (sem browser)
export const maxDuration = 30

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchResult {
  source: string
  snippets: string[]
  urls: string[]
}

// ─── Utilities ────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, options: RequestInit = {}, ms = 10000): Promise<Response> {
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

function extractProcessNumbers(text: string): string[] {
  return [...new Set(
    [...text.matchAll(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g)].map(m => m[0])
  )].slice(0, 15)
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
  'Cache-Control': 'no-cache',
}

// ─── DataJud — API oficial do CNJ ─────────────────────────────────────────────
// HTTP puro, gratuito, sem browser, sem login.
// Cobre todos os tribunais brasileiros (TJs, TRTs, TRFs, STJ, STF...).
// Chave pública de demonstração; registre a sua em: https://datajud-wiki.cnj.jus.br/

const DATAJUD_BASE = 'https://api-publica.datajud.cnj.jus.br'
// Chave resolvida em runtime: DB → env var → chave pública demo do CNJ
function DATAJUD_KEY(keyFromDb?: string | null): string {
  return keyFromDb || process.env.DATAJUD_API_KEY ||
    'cDZHYzlZa0JadVREZDJCendFbzFKdnQ6SkJlTzNjLV9TRENyQVk4Q3JqWTg3UA=='
}

// 27 tribunais estaduais
const ALL_TJS = [
  'tjac','tjal','tjam','tjap','tjba','tjce','tjdft','tjes',
  'tjgo','tjma','tjmg','tjms','tjmt','tjpa','tjpb','tjpe',
  'tjpi','tjpr','tjrj','tjrn','tjro','tjrr','tjrs','tjsc',
  'tjse','tjsp','tjto',
]
// 24 tribunais do trabalho
const ALL_TRTS = Array.from({ length: 24 }, (_, i) => `trt${i + 1}`)

interface DataJudProcess {
  numeroProcesso?: string
  tribunal?: string
  classe?: { nome?: string }
  assuntos?: Array<{ nome?: string }>
  orgaoJulgador?: { nome?: string }
  dataAjuizamento?: string
  grau?: string
  partes?: Array<{ nome?: string; polo?: string }>
}

async function queryDataJudTribunal(
  tribunal: string,
  query: Record<string, unknown>,
  apiKey: string,
): Promise<DataJudProcess[]> {
  try {
    const res = await fetchWithTimeout(
      `${DATAJUD_BASE}/api_publica_${tribunal}/_search`,
      {
        method: 'POST',
        headers: {
          Authorization: `APIKey ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ size: 10, query }),
      },
      8000,
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data?.hits?.hits ?? []).map((h: { _source: DataJudProcess }) => h._source)
  } catch {
    return []
  }
}

function buildDataJudQuery(cpf: string | null, name: string): Record<string, unknown> {
  // DataJud usa Elasticsearch com o campo `partes` do tipo nested.
  // Queries sem wrapper `nested` retornam sempre 0 resultados.
  // Também tentamos a query flat (caso o índice tenha include_in_root).
  //
  // Estrutura real de documentos:
  //   partes[].nome               → nome da parte
  //   partes[].pessoa.documentos[].tipo   → "CPF" | "CNPJ" | ...
  //   partes[].pessoa.documentos[].numero → número do documento
  //
  // A API pública NÃO indexa CPF para busca direta (LGPD),
  // mas incluímos as tentativas de CPF como should bônus.

  const cpfFmt = cpf ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : null

  // Query de nome — exige todos os tokens do nome no campo partes.nome
  const nameMatchQuery = {
    match: {
      'partes.nome': { query: name, operator: 'and' },
    },
  }

  const shouldClauses: Record<string, unknown>[] = [
    // ── Nested (partes é nested type — principal) ─────────────────────────────
    { nested: { path: 'partes', query: nameMatchQuery } },
    // ── Flat (caso o índice use include_in_root ou object type) ──────────────
    nameMatchQuery,
  ]

  if (cpf && cpfFmt) {
    // CPF via campo cpfCnpj (variação observada em alguns tribunais)
    shouldClauses.push(
      { nested: { path: 'partes', query: { match: { 'partes.cpfCnpj': cpf } } } },
      { nested: { path: 'partes', query: { match: { 'partes.cpfCnpj': cpfFmt } } } },
      // CPF via estrutura pessoa.documentos
      {
        nested: {
          path: 'partes',
          query: {
            bool: {
              must: [
                { match: { 'partes.pessoa.documentos.numero': cpf } },
              ],
            },
          },
        },
      },
      // Versões flat (bônus)
      { match: { 'partes.cpfCnpj': cpf } },
      { match: { 'partes.cpfCnpj': cpfFmt } },
    )
  }

  return {
    bool: {
      should: shouldClauses,
      minimum_should_match: 1,
    },
  }
}

function formatDataJudProcess(p: DataJudProcess, tribunal: string): string {
  const parts: string[] = []
  if (p.numeroProcesso) parts.push(`Processo: ${p.numeroProcesso}`)
  parts.push(`Tribunal: ${(p.tribunal ?? tribunal).toUpperCase()}`)
  if (p.grau) parts.push(`Grau: ${p.grau}`)
  if (p.classe?.nome) parts.push(`Classe: ${p.classe.nome}`)
  if (p.assuntos?.length) parts.push(`Assunto(s): ${p.assuntos.slice(0, 3).map(a => a.nome).filter(Boolean).join(', ')}`)
  if (p.orgaoJulgador?.nome) parts.push(`Órgão: ${p.orgaoJulgador.nome}`)
  if (p.dataAjuizamento) parts.push(`Ajuizamento: ${p.dataAjuizamento.slice(0, 10)}`)
  if (p.partes?.length) {
    const partesStr = p.partes.slice(0, 4)
      .filter(pt => pt.nome)
      .map(pt => `${pt.nome} [${pt.polo ?? '?'}]`)
      .join('; ')
    if (partesStr) parts.push(`Partes: ${partesStr}`)
  }
  return parts.join(' | ')
}

async function searchDataJud(name: string, cpf: string | null, apiKey: string): Promise<SearchResult> {
  const query = buildDataJudQuery(cpf, name)

  // Dispara todos os tribunais em paralelo (HTTP puro, ~1-3s total)
  const tribunals = [...ALL_TJS, ...ALL_TRTS]
  const settled = await Promise.allSettled(
    tribunals.map(t => queryDataJudTribunal(t, query, apiKey))
  )

  const processLines: string[] = []
  settled.forEach((r, i) => {
    if (r.status !== 'fulfilled' || !r.value.length) return
    const tribunal = tribunals[i]
    r.value.forEach(p => processLines.push(formatDataJudProcess(p, tribunal)))
  })

  const snippets: string[] = []
  if (processLines.length === 0) {
    snippets.push(
      'Nenhum processo encontrado no DataJud (CNJ) para este candidato ' +
      `nos ${ALL_TJS.length} tribunais estaduais e ${ALL_TRTS.length} tribunais trabalhistas consultados.`
    )
  } else {
    snippets.push(
      `${processLines.length} processo(s) encontrado(s) no DataJud (CNJ) — fonte oficial:`
    )
    processLines.slice(0, 50).forEach(line => snippets.push(line))
  }

  return { source: 'DataJud — CNJ (oficial)', snippets, urls: [] }
}

// ─── Escavador ────────────────────────────────────────────────────────────────

async function searchGoogle(query: string, label = 'Google'): Promise<SearchResult> {
  try {
    const res = await fetchWithTimeout(
      `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=br&num=10`,
      {
        headers: {
          ...BROWSER_HEADERS,
          Referer: 'https://www.google.com.br/',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
        },
      },
      12000,
    )
    if (!res.ok) return { source: label, snippets: [], urls: [] }
    const html = await res.text()
    const urls = [...html.matchAll(/\/url\?q=(https?:\/\/[^&"]+)&/gi)]
      .map(m => { try { return decodeURIComponent(m[1]) } catch { return m[1] } })
      .filter(u => !u.includes('google.com') && !u.includes('googleapis'))
      .filter((u, i, a) => a.indexOf(u) === i)
      .slice(0, 10)
    const text = stripHtml(html)
    const snippets: string[] = []
    const p1 = [...html.matchAll(/<div[^>]*class="[^"]*VwiC3b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)]
    p1.slice(0, 5).forEach(m => { const t = stripHtml(m[1]).trim(); if (t.length > 30) snippets.push(t) })
    if (snippets.length < 2) {
      const rel = extractAround(text, /processo|escavador|auxílio|benefício|trabalhista|criminal/i, 100, 400, 4)
      if (rel.trim().length > 50) snippets.push(rel.slice(0, 1500))
    }
    return { source: label, snippets: [...new Set(snippets)].slice(0, 6), urls }
  } catch {
    return { source: label, snippets: [], urls: [] }
  }
}

async function searchEscavador(name: string, cpf: string | null): Promise<SearchResult> {
  const allSnippets: string[] = []
  const allUrls: string[] = []

  const googleResults = await Promise.allSettled([
    ...(cpf ? [searchGoogle(`"${cpf}" escavador`, 'Google → Escavador')] : []),
    searchGoogle(`"${name}" escavador processos`, 'Google → Escavador'),
  ])

  const escProfileUrls: string[] = []
  for (const r of googleResults) {
    if (r.status !== 'fulfilled') continue
    allSnippets.push(...r.value.snippets)
    allUrls.push(...r.value.urls)
    escProfileUrls.push(...r.value.urls.filter(u => u.includes('escavador.com')))
  }

  const directUrl = cpf
    ? `https://www.escavador.com/busca?q=${encodeURIComponent(cpf)}&tipo=pessoas`
    : `https://www.escavador.com/busca?q=${encodeURIComponent(`"${name}"`)}&tipo=pessoas`

  const fetchTargets = [...new Set(escProfileUrls)].slice(0, 2)
  if (!fetchTargets.length) fetchTargets.push(directUrl)

  const pageFetches = await Promise.allSettled(fetchTargets.map(async url => {
    const res = await fetchWithTimeout(url, { headers: { ...BROWSER_HEADERS, Referer: 'https://www.google.com.br/' } }, 10000)
    if (!res.ok) return { snippets: [] as string[] }
    const html = await res.text()
    const text = stripHtml(html)
    const nums = extractProcessNumbers(text)
    const snips: string[] = []
    if (nums.length) snips.push(`Processos no Escavador: ${nums.join(' | ')}`)
    const rel = extractAround(text, /processo|envolvido|parte|criminal|trabalhista|cível/i, 80, 400, 4)
    if (rel.trim().length > 50) snips.push(rel.slice(0, 1200))
    return { snippets: snips }
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


// ─── Fallback sem IA ─────────────────────────────────────────────────────────
// Quando nenhuma chave de IA está configurada, exibe os dados brutos do DataJud.

function buildFallbackResult(results: SearchResult[]): BackgroundCheckResult {
  const datajudResult = results.find(r => r.source.includes('DataJud'))
  const snippets = datajudResult?.snippets ?? []

  // Primeiro snippet é o resumo ("X processo(s) encontrado(s)..." ou "Nenhum processo...")
  const summaryLine = snippets[0] ?? 'DataJud consultado.'
  const noProcessos = !snippets.length || summaryLine.includes('Nenhum processo')
  // Linhas seguintes são os processos formatados (uma por linha)
  const processLines = noProcessos ? [] : snippets.slice(1)

  return {
    processos_judiciais: {
      encontrado: processLines.length > 0,
      resumo: summaryLine,
      detalhes: processLines,
      urls: [],
    },
    beneficios_governamentais: { encontrado: false, lista: [], resumo: 'Não verificado.' },
    outras_informacoes: { items: [], resumo: '' },
    parecer_geral: processLines.length === 0
      ? 'Nenhum processo judicial encontrado nos 51 tribunais estaduais e trabalhistas consultados via DataJud (CNJ).'
      : `${processLines.length} processo(s) encontrado(s) no DataJud. Configure uma chave de IA em Configurações → Configuração IA para análise detalhada.`,
    nivel_risco: processLines.length === 0 ? 'baixo' : 'nao_determinado',
    fontes_consultadas: [],
    observacoes_tecnicas: processLines.length > 0
      ? 'Configure uma chave de IA para análise inteligente dos processos encontrados.'
      : 'Configure uma chave de IA em Configurações → Configuração IA para análise detalhada.',
  }
}

// ─── AI Prompt ────────────────────────────────────────────────────────────────

function buildPrompt(name: string, cpf: string | null, city: string | null, results: SearchResult[]): string {
  const cpfFormatted = cpf?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') ?? 'Não informado'
  const usedCpf = !!cpf

  const blocks = results.map(r => {
    if (!r.snippets.length && !r.urls.length) return `\n═══ ${r.source.toUpperCase()} ═══\nSem dados retornados.\n`
    const urlBlock = r.urls.length ? `URLs:\n${r.urls.map(u => `  • ${u}`).join('\n')}` : ''
    const snipBlock = r.snippets.length ? `Dados:\n${r.snippets.map(s => `  ${s}`).join('\n')}` : ''
    return `\n═══ ${r.source.toUpperCase()} ═══\n${urlBlock}\n${snipBlock}\n`
  }).join('')

  return `Você é um analista especializado em background check judicial para processos seletivos no Brasil.

━━━ CANDIDATO ━━━
Nome: "${name}"
CPF: ${cpfFormatted}${usedCpf ? ' ← identificador único — resultados são 100% desta pessoa' : ' (não informado — busca feita por nome, possível homonímia)'}
Cidade: ${city || 'Não informada'}

━━━ FONTES CONSULTADAS ━━━
• DataJud (CNJ): API oficial do Conselho Nacional de Justiça — 27 TJs estaduais + 24 TRTs trabalhistas.
  Busca por nome ("${name}") usando nested query (estrutura obrigatória do DataJud) com todos os termos.
  ${usedCpf ? `CPF ${cpfFormatted} incluído como critério adicional (nested + flat, via cpfCnpj e pessoa.documentos.numero).` : 'CPF não informado — busca apenas por nome; homonímia é possível em nomes comuns.'}
• Escavador: agregador público de processos judiciais.

━━━ DADOS COLETADOS ━━━
${blocks}

━━━ INSTRUÇÕES ━━━

PROCESSOS JUDICIAIS:
- Liste TODOS os processos encontrados com: número completo, tribunal, classe, assunto e polo (autor/réu/reclamante/reclamado)
- Classifique o tipo: criminal, trabalhista, cível, família, execução fiscal, etc.
- A busca no DataJud é feita por nome; verifique se as partes listadas conferem com "${name}"${usedCpf ? ` ou CPF ${cpfFormatted}` : ''} para confirmar que é o mesmo candidato (evitar homonímia).
- Se DataJud retornou "Nenhum processo encontrado", registre claramente.
- Nunca invente ou presuma processos — use APENAS os dados coletados acima.

RIGOR:
- "encontrado: true" somente com evidência explícita e concreta
- Se não há dados suficientes, use nivel_risco: "nao_determinado"

Retorne SOMENTE este JSON (sem markdown):
{
  "processos_judiciais": {
    "encontrado": false,
    "resumo": "descrição objetiva; se houver processos, cite número e tribunal",
    "detalhes": ["Processo 0001234-56.2023.8.26.0001 — TJSP — Procedimento Comum Cível — réu", "..."],
    "urls": []
  },
  "beneficios_governamentais": { "encontrado": false, "lista": [], "resumo": "Não verificado." },
  "outras_informacoes": {
    "items": [],
    "resumo": "Nenhuma informação adicional encontrada."
  },
  "parecer_geral": "2-3 frases diretas para o recrutador sobre o resultado da pesquisa judicial",
  "nivel_risco": "baixo",
  "fontes_consultadas": ["DataJud — CNJ (oficial)", "Escavador"],
  "observacoes_tecnicas": "ex: CPF não informado — busca por nome pode ter homonímia"
}
Valores válidos para nivel_risco: "baixo" | "medio" | "alto" | "nao_determinado"`
}

// ─── Call AI ──────────────────────────────────────────────────────────────────

async function callAI(
  prompt: string,
  supabase: Awaited<ReturnType<typeof createSupabaseServiceClient>>,
): Promise<BackgroundCheckResult | null> {
  // Query própria — não depende de dados externos; usa maybeSingle para não falhar se não houver linha
  const { data: s } = await supabase
    .from('ai_settings')
    .select('anthropic_api_key_encrypted, openai_api_key_encrypted')
    .limit(1)
    .maybeSingle()

  if (s?.anthropic_api_key_encrypted) {
    try {
      const res = await fetchWithTimeout(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'x-api-key': s.anthropic_api_key_encrypted,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 2000,
            messages: [{ role: 'user', content: prompt }],
          }),
        },
        28000,
      )
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
      const res = await fetchWithTimeout(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${s.openai_api_key_encrypted}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            max_tokens: 2000,
            response_format: { type: 'json_object' },
            messages: [{ role: 'user', content: prompt }],
          }),
        },
        28000,
      )
      if (res.ok) {
        const data = await res.json()
        const text: string = data?.choices?.[0]?.message?.content || ''
        const m = text.match(/\{[\s\S]*\}/)
        if (m) return JSON.parse(m[0]) as BackgroundCheckResult
      }
    } catch { /* fallthrough */ }
  }

  return null
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
      .from('candidates')
      .select('full_name, cpf, city')
      .eq('id', id)
      .single()
    if (!candidate) return NextResponse.json({ error: 'Candidato não encontrado.' }, { status: 404 })

    const { full_name, cpf, city } = candidate
    const cpfClean = cpf?.replace(/\D/g, '') || null
    const cpfFormatted = cpfClean?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') ?? null

    // ── Chave DataJud: banco → env var → chave pública demo ───────────────────
    const { data: aiSettings } = await supabase
      .from('ai_settings')
      .select('datajud_api_key')
      .limit(1)
      .maybeSingle()

    const datajudKey = DATAJUD_KEY(aiSettings?.datajud_api_key)

    // ── Buscas em paralelo ────────────────────────────────────────────────────
    // DataJud: 51 tribunais em paralelo via HTTP (~2-4s total)
    // Escavador: busca complementar pública
    const [dataJudR, escavadorR] = await Promise.allSettled([
      searchDataJud(full_name, cpfClean, datajudKey),
      searchEscavador(full_name, cpfClean),
    ])

    const results: SearchResult[] = [
      dataJudR.status   === 'fulfilled' ? dataJudR.value   : { source: 'DataJud — CNJ (oficial)', snippets: [], urls: [] },
      escavadorR.status === 'fulfilled' ? escavadorR.value : { source: 'Escavador',               snippets: [], urls: [] },
    ]

    const prompt = buildPrompt(full_name, cpfClean, city, results)
    const aiResult = await callAI(prompt, supabase)
    // Se não há chave de IA, exibe os dados brutos do DataJud diretamente
    const result: BackgroundCheckResult = aiResult ?? buildFallbackResult(results)

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
