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
// NOTA TÉCNICA: A API pública do DataJud (api-publica.datajud.cnj.jus.br)
// NÃO indexa o campo `partes` (nome/CPF das partes) em nenhum tribunal.
// Isso é uma restrição de LGPD do endpoint público.
// O campo `partes` existe no schema mas nunca está presente nos documentos
// retornados — `exists: {field: "partes"}` retorna 0 resultados em todos os TJs.
// Portanto: busca por nome/CPF via DataJud público é impossível.
// Para pesquisa real de partes, usamos JusBrasil + Escavador (veja abaixo).
// Para consultar processos por número, acesse: https://datajud.cnj.jus.br/

function searchDataJud(): SearchResult {
  // Retorna aviso informativo — sem chamadas de rede (campo partes não existe na API pública)
  return {
    source: 'DataJud — CNJ (oficial)',
    snippets: [
      'A API pública do DataJud/CNJ não indexa nomes ou CPFs das partes (restrição LGPD). ' +
      'A busca de processos por nome/CPF é feita via JusBrasil e Escavador. ' +
      'Para consulta por número de processo, acesse datajud.cnj.jus.br.',
    ],
    urls: ['https://datajud.cnj.jus.br/'],
  }
}

// ─── JusBrasil ────────────────────────────────────────────────────────────────
// Maior agregador público de processos judiciais do Brasil.
// Indexa partes (nome/CPF) e permite busca pública sem login para resultados básicos.

async function searchJusBrasil(name: string, cpf: string | null): Promise<SearchResult> {
  const cpfFmt = cpf ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : null
  const allSnippets: string[] = []
  const allUrls: string[] = []

  // Monta as URLs de busca — CPF tem prioridade por ser identificador único
  const searchTargets: Array<{ url: string; label: string }> = []

  if (cpfFmt) {
    searchTargets.push({
      url: `https://www.jusbrasil.com.br/processos/pesquisa?query=${encodeURIComponent(cpfFmt)}`,
      label: 'JusBrasil CPF',
    })
  }
  searchTargets.push({
    url: `https://www.jusbrasil.com.br/processos/pesquisa?query=${encodeURIComponent(`"${name}"`)}&origem=nome`,
    label: 'JusBrasil nome',
  })

  const fetches = await Promise.allSettled(
    searchTargets.map(async ({ url }) => {
      const res = await fetchWithTimeout(url, {
        headers: {
          ...BROWSER_HEADERS,
          Referer: 'https://www.jusbrasil.com.br/',
        },
      }, 12000)
      if (!res.ok) return { snippets: [] as string[], url }
      const html = await res.text()
      const text = stripHtml(html)
      const nums = extractProcessNumbers(text)
      const snips: string[] = []
      if (nums.length) snips.push(`Processos no JusBrasil: ${nums.join(' | ')}`)
      const rel = extractAround(text, /processo|parte|criminal|trabalhista|cível|réu|autor|reclamante|reclamado/i, 80, 500, 4)
      if (rel.trim().length > 50) snips.push(rel.slice(0, 1500))
      return { snippets: snips, url }
    })
  )

  for (let i = 0; i < fetches.length; i++) {
    const r = fetches[i]
    if (r.status === 'fulfilled') {
      allSnippets.push(...r.value.snippets)
      allUrls.push(r.value.url)
    } else {
      allUrls.push(searchTargets[i].url)
    }
  }

  return {
    source: 'JusBrasil',
    snippets: [...new Set(allSnippets)].filter(s => s.length > 20).slice(0, 6),
    urls: [...new Set(allUrls)].slice(0, 4),
  }
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
  const cpfFmt = cpf ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : null
  const allSnippets: string[] = []
  const allUrls: string[] = []

  // Primeiro: Google para encontrar o perfil no Escavador
  const googleResults = await Promise.allSettled([
    ...(cpfFmt ? [searchGoogle(`"${cpfFmt}" escavador`, 'Google → Escavador')] : []),
    searchGoogle(`"${name}" escavador processos`, 'Google → Escavador'),
  ])

  const escProfileUrls: string[] = []
  for (const r of googleResults) {
    if (r.status !== 'fulfilled') continue
    allSnippets.push(...r.value.snippets)
    allUrls.push(...r.value.urls)
    escProfileUrls.push(...r.value.urls.filter(u => u.includes('escavador.com')))
  }

  // Segundo: URLs diretas do Escavador por CPF (tentativa prioritária)
  const directUrls: string[] = []
  if (cpfFmt) {
    directUrls.push(
      `https://www.escavador.com/sobre/${encodeURIComponent(cpfFmt)}`,
      `https://www.escavador.com/busca?q=${encodeURIComponent(cpfFmt)}&tipo=pessoas`,
    )
  } else {
    directUrls.push(
      `https://www.escavador.com/busca?q=${encodeURIComponent(`"${name}"`)}&tipo=pessoas`,
    )
  }

  // Mescla perfis do Google + URLs diretas (sem duplicatas), limitado a 3 fetches
  const fetchTargets = [...new Set([...escProfileUrls.slice(0, 1), ...directUrls])].slice(0, 3)

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
// Quando nenhuma chave de IA está configurada, exibe os dados brutos das fontes.

function buildFallbackResult(results: SearchResult[]): BackgroundCheckResult {
  // Agrega snippets de todas as fontes que realmente têm dados de processos
  const processSnippets: string[] = []
  const allUrls: string[] = []

  for (const r of results) {
    if (r.source.includes('DataJud')) continue // DataJud público não tem partes — pula
    const hasProcess = r.snippets.some(s =>
      s.toLowerCase().includes('processo') || /\d{7}-\d{2}\.\d{4}/.test(s)
    )
    if (hasProcess) {
      processSnippets.push(...r.snippets.filter(s =>
        s.toLowerCase().includes('processo') || /\d{7}-\d{2}\.\d{4}/.test(s)
      ))
    }
    allUrls.push(...r.urls)
  }

  const hasProcesses = processSnippets.length > 0
  const uniqueUrls = [...new Set(allUrls)].slice(0, 6)

  return {
    processos_judiciais: {
      encontrado: hasProcesses,
      resumo: hasProcesses
        ? `Processos encontrados via JusBrasil/Escavador.`
        : 'Nenhum processo encontrado no JusBrasil ou Escavador para este candidato.',
      detalhes: processSnippets.slice(0, 20),
      urls: uniqueUrls,
    },
    beneficios_governamentais: { encontrado: false, lista: [], resumo: 'Não verificado.' },
    outras_informacoes: { items: [], resumo: '' },
    parecer_geral: hasProcesses
      ? `Processos encontrados nas fontes consultadas. Configure uma chave de IA em Configurações → Configuração IA para análise detalhada.`
      : 'Nenhum processo judicial encontrado no JusBrasil ou Escavador para este candidato.',
    nivel_risco: hasProcesses ? 'nao_determinado' : 'baixo',
    fontes_consultadas: [],
    observacoes_tecnicas: hasProcesses
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
• JusBrasil: maior agregador público de processos judiciais do Brasil. Busca por ${usedCpf ? `CPF ${cpfFormatted} (identificador único)` : `nome "${name}"`}.
• Escavador: agregador público de processos judiciais. Busca por ${usedCpf ? `CPF ${cpfFormatted}` : `nome "${name}"`}.
• DataJud (CNJ): API oficial do CNJ — não indexa partes (LGPD) no endpoint público; listado para referência.

━━━ DADOS COLETADOS ━━━
${blocks}

━━━ INSTRUÇÕES ━━━

PROCESSOS JUDICIAIS:
- Liste TODOS os processos encontrados com: número completo, tribunal, classe, assunto e polo (autor/réu/reclamante/reclamado)
- Classifique o tipo: criminal, trabalhista, cível, família, execução fiscal, etc.
- ${usedCpf ? `CPF ${cpfFormatted} foi usado como critério de busca — resultados são do candidato.` : `Verifique se as partes conferem com "${name}" para evitar homonímia.`}
- Se os dados mostram "Nenhum processo encontrado", registre claramente.
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
  "fontes_consultadas": ["JusBrasil", "Escavador"],
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

    // ── Buscas em paralelo ────────────────────────────────────────────────────
    // JusBrasil e Escavador: buscam por nome/CPF (têm partes indexadas)
    // DataJud: retorna aviso sobre limitação LGPD (sem chamada de rede)
    const [jusBrasilR, escavadorR] = await Promise.allSettled([
      searchJusBrasil(full_name, cpfClean),
      searchEscavador(full_name, cpfClean),
    ])

    const dataJudResult = searchDataJud()

    const results: SearchResult[] = [
      dataJudResult,
      jusBrasilR.status   === 'fulfilled' ? jusBrasilR.value   : { source: 'JusBrasil', snippets: [], urls: [] },
      escavadorR.status   === 'fulfilled' ? escavadorR.value   : { source: 'Escavador', snippets: [], urls: [] },
    ]

    const prompt = buildPrompt(full_name, cpfClean, city, results)
    const aiResult = await callAI(prompt, supabase)
    // Se não há chave de IA, exibe os dados brutos das fontes diretamente
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
