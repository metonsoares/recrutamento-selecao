import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { getAnthropicKey, getOpenAIKey } from '@/lib/ai-key'
import { BackgroundCheckResult } from '@/types'

// Tempo máximo: buscas (≤16s) + IA (≤18s) = ≤34s com folga
export const maxDuration = 45

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

// ─── Helpers de parsing ───────────────────────────────────────────────────────

/** Extrai snippets e números de processo de uma página HTML do Escavador */
function parseEscavadorPage(html: string): string[] {
  const text = stripHtml(html)
  const nums = extractProcessNumbers(text)
  const snips: string[] = []
  if (nums.length) snips.push(`Processos: ${nums.join(' | ')}`)
  const rel = extractAround(text, /processo|polo|aparece em|trabalhist|criminal|cível|envolvido/i, 80, 600, 5)
  if (rel.trim().length > 50) snips.push(rel.slice(0, 2000))
  return snips
}

/** Extrai URLs de perfil do Escavador (/cpf/ ou /nomes/) de um bloco de HTML */
function extractEscavadorProfileUrls(html: string): string[] {
  return [
    ...[...html.matchAll(/href="(https:\/\/www\.escavador\.com\/(?:cpf|nomes)\/[^"]+)"/g)].map(m => m[1]),
    ...[...html.matchAll(/href="(\/(?:cpf|nomes)\/[^"]+)"/g)].map(m => `https://www.escavador.com${m[1]}`),
  ].filter((u, i, a) => a.indexOf(u) === i).slice(0, 2)
}

/** Faz fetch via Google e extrai snippets + URLs relevantes */
async function searchGoogle(query: string, filterDomain?: string): Promise<{ snippets: string[]; urls: string[] }> {
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
      8000,
    )
    if (!res.ok) return { snippets: [], urls: [] }
    const html = await res.text()
    const urls = [...html.matchAll(/\/url\?q=(https?:\/\/[^&"]+)&/gi)]
      .map(m => { try { return decodeURIComponent(m[1]) } catch { return m[1] } })
      .filter(u => !u.includes('google.com') && !u.includes('googleapis'))
      .filter((u, i, a) => a.indexOf(u) === i)
      .filter(u => !filterDomain || u.includes(filterDomain))
      .slice(0, 8)
    const snippets: string[] = []
    // Extrai snippets dos divs de resultado do Google (classe VwiC3b)
    const divMatches = [...html.matchAll(/<div[^>]*class="[^"]*VwiC3b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)]
    divMatches.slice(0, 6).forEach(m => {
      const t = stripHtml(m[1]).trim()
      if (t.length > 30) snippets.push(t)
    })
    // Fallback: texto livre ao redor de palavras-chave judiciais
    if (snippets.length < 2) {
      const text = stripHtml(html)
      const rel = extractAround(text, /processo|aparece em|escavador|trabalhist|criminal/i, 80, 400, 3)
      if (rel.trim().length > 50) snippets.push(rel.slice(0, 1200))
    }
    return { snippets: [...new Set(snippets)].slice(0, 5), urls }
  } catch {
    return { snippets: [], urls: [] }
  }
}

// ─── JusBrasil ────────────────────────────────────────────────────────────────
// Acesso direto bloqueado por Cloudflare. Apenas retorna a URL para consulta
// manual e tenta obter snippets via Google (sem acessar JusBrasil diretamente).

function searchJusBrasil(name: string, cpf: string | null): SearchResult {
  const cpfFmt = cpf ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : null
  const searchUrl = cpfFmt
    ? `https://www.jusbrasil.com.br/processos/pesquisa?query=${encodeURIComponent(cpfFmt)}`
    : `https://www.jusbrasil.com.br/processos/pesquisa?query=${encodeURIComponent(`"${name}"`)}`
  return { source: 'JusBrasil', snippets: [], urls: [searchUrl] }
}

// ─── Escavador ────────────────────────────────────────────────────────────────
// Estratégia em 2 tentativas:
// 1ª: acesso direto à página de busca por CPF + seguir link de perfil (rápido, ~5-8s)
// 2ª: se bloqueado (IPs Vercel), fallback via Google para extrair snippets (~8s)

async function searchEscavador(name: string, cpf: string | null): Promise<SearchResult> {
  const cpfFmt = cpf ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : null
  const allSnippets: string[] = []
  const busqaUrl = cpfFmt
    ? `https://www.escavador.com/busca?q=${encodeURIComponent(cpfFmt)}&tipo=pessoas`
    : `https://www.escavador.com/busca?q=${encodeURIComponent(`"${name}"`)}&tipo=pessoas`
  const allUrls: string[] = [busqaUrl]

  // ── Tentativa 1: acesso direto ────────────────────────────────────────────
  let directSucceeded = false
  try {
    const busqaRes = await fetchWithTimeout(busqaUrl, {
      headers: { ...BROWSER_HEADERS, Referer: 'https://www.google.com.br/' },
    }, 5000)

    if (busqaRes.ok) {
      const busqaHtml = await busqaRes.text()
      const busqaSnips = parseEscavadorPage(busqaHtml)
      const profileUrls = extractEscavadorProfileUrls(busqaHtml)

      // Se a página retornou conteúdo útil (snippets ou link de perfil): direto funcionou
      if (busqaSnips.length > 0 || profileUrls.length > 0) {
        directSucceeded = true
        allSnippets.push(...busqaSnips)
        allUrls.push(...profileUrls)

        // Busca o perfil CPF vinculado (tem o resumo rico: "X processos em RJ...")
        if (profileUrls.length > 0) {
          try {
            const profileRes = await fetchWithTimeout(profileUrls[0], {
              headers: { ...BROWSER_HEADERS, Referer: 'https://www.escavador.com/' },
            }, 5000)
            if (profileRes.ok) {
              allSnippets.push(...parseEscavadorPage(await profileRes.text()))
            }
          } catch { /* skip */ }
        }
      }
    }
  } catch { /* acesso direto falhou */ }

  // ── Tentativa 2: fallback via Google ─────────────────────────────────────
  // Quando Escavador bloqueia o IP (ex.: Vercel), Google indexa o conteúdo
  // e os snippets de busca já contêm "X aparece em Y processos em RJ".
  if (!directSucceeded) {
    const queries = [
      ...(cpfFmt ? [`"${cpfFmt}" site:escavador.com`] : []),
      `"${name}" processos escavador`,
    ]
    const googleResults = await Promise.allSettled(
      queries.map(q => searchGoogle(q, 'escavador.com'))
    )
    for (const r of googleResults) {
      if (r.status !== 'fulfilled') continue
      allSnippets.push(...r.value.snippets)
      allUrls.push(...r.value.urls)
    }

    // Também tenta Google sem filtro de site para resultados mais amplos
    const broadResult = await searchGoogle(
      cpfFmt
        ? `"${cpfFmt}" processos judiciais`
        : `"${name}" processos judiciais antecedentes`
    )
    allSnippets.push(...broadResult.snippets)
  }

  return {
    source: 'Escavador',
    snippets: [...new Set(allSnippets)].filter(s => s.length > 20).slice(0, 8),
    urls: [...new Set(allUrls.filter(u => u.includes('escavador.com')))].slice(0, 4),
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
- Liste TODOS os processos encontrados com: número (se disponível), tribunal, classe, assunto e polo
- Classifique obrigatoriamente o tipo de cada processo: criminal, trabalhista, cível, família, execução fiscal, improbidade administrativa, etc.
- Destaque ESPECIALMENTE processos trabalhistas (indicam ex-funcionários ou empregadores que processaram o candidato) e processos criminais/MPF
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

async function callAI(prompt: string): Promise<BackgroundCheckResult | null> {
  // Resolve chaves descriptografadas via utilitário centralizado
  // (env var → banco descriptografado, em ordem de prioridade)
  const [anthropicKey, openaiKey] = await Promise.all([getAnthropicKey(), getOpenAIKey()])

  if (anthropicKey) {
    try {
      const res = await fetchWithTimeout(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 1500,
            messages: [{ role: 'user', content: prompt }],
          }),
        },
        18000,
      )
      if (res.ok) {
        const data = await res.json()
        const text: string = data?.content?.[0]?.text || ''
        const m = text.match(/\{[\s\S]*\}/)
        if (m) return JSON.parse(m[0]) as BackgroundCheckResult
      }
    } catch { /* fallthrough to OpenAI */ }
  }

  if (openaiKey) {
    try {
      const res = await fetchWithTimeout(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            max_tokens: 1500,
            response_format: { type: 'json_object' },
            messages: [{ role: 'user', content: prompt }],
          }),
        },
        18000,
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

    // ── Buscas ────────────────────────────────────────────────────────────────
    // JusBrasil: retorna URL de busca instantaneamente (Cloudflare bloqueia fetch direto)
    // Escavador: tenta acesso direto (5s) → fallback Google (8s) se bloqueado
    // DataJud: retorna aviso LGPD sem rede
    // Execução total das buscas: ≤ 10s (direto) ou ≤ 16s (fallback Google)
    const [escavadorR] = await Promise.allSettled([
      searchEscavador(full_name, cpfClean),
    ])

    const dataJudResult  = searchDataJud()
    const jusBrasilResult = searchJusBrasil(full_name, cpfClean)

    const results: SearchResult[] = [
      dataJudResult,
      jusBrasilResult,
      escavadorR.status === 'fulfilled' ? escavadorR.value : { source: 'Escavador', snippets: [], urls: [] },
    ]

    const prompt = buildPrompt(full_name, cpfClean, city, results)
    const aiResult = await callAI(prompt)
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
