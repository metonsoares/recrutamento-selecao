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

/** DuckDuckGo HTML (endpoint sem JS — muito mais acessível de IPs de servidor que Google) */
async function searchDuckDuckGo(query: string, filterDomain?: string): Promise<{ snippets: string[]; urls: string[] }> {
  try {
    const res = await fetchWithTimeout(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=br-pt`,
      {
        headers: {
          ...BROWSER_HEADERS,
          Referer: 'https://duckduckgo.com/',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      },
      8000,
    )
    if (!res.ok) return { snippets: [], urls: [] }
    const html = await res.text()

    // DDG HTML encoda URLs como //duckduckgo.com/l/?uddg=URL_ENCODED
    const urls: string[] = []
    const uddgMatches = [...html.matchAll(/uddg=([^&"]+)/gi)]
    for (const m of uddgMatches) {
      try {
        const url = decodeURIComponent(m[1])
        if (url.startsWith('http') && !url.includes('duckduckgo.com')) {
          if (!filterDomain || url.includes(filterDomain)) urls.push(url)
        }
      } catch { /* skip */ }
    }

    // Snippets: DDG usa class="result__snippet"
    const snippets: string[] = []
    const snipMatches = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi)]
    for (const m of snipMatches.slice(0, 8)) {
      const t = stripHtml(m[1]).trim()
      if (t.length > 30) snippets.push(t)
    }
    // Fallback: texto livre
    if (snippets.length < 2) {
      const text = stripHtml(html)
      const rel = extractAround(text, /processo|aparece em|escavador|trabalhist|criminal/i, 80, 400, 3)
      if (rel.trim().length > 50) snippets.push(rel.slice(0, 1200))
    }
    return { snippets: [...new Set(snippets)].slice(0, 5), urls: [...new Set(urls)].slice(0, 8) }
  } catch {
    return { snippets: [], urls: [] }
  }
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

// ─── Escavador — API oficial v2 ───────────────────────────────────────────────
// Doc: https://api.escavador.com/v2/docs/consulta-de-processos
// "Resumo de processos do envolvido por nome ou CPF/CNPJ"
// GET /api/v2/envolvido/processos?cpf_cnpj=... (ou ?nome=...)

async function getEscavadorKey(): Promise<string | null> {
  try {
    const service = await createSupabaseServiceClient()
    const { data } = await service.from('ai_settings').select('escavador_api_key').limit(1).single()
    const k = (data?.escavador_api_key as string | null)?.trim()
    return k || process.env.ESCAVADOR_API_KEY || null
  } catch {
    return process.env.ESCAVADOR_API_KEY || null
  }
}

/** Faz uma tentativa única na API do Escavador. Retorna o objeto data em 200, ou um marcador de status. */
async function escavadorAttempt(qs: string, token: string): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; status: number; detail: string }> {
  const url = `https://api.escavador.com/api/v2/envolvido/processos?${qs}`
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
  }, 15000)
  if (res.ok) return { ok: true, data: await res.json() }
  // Extrai mensagem + erros de validação (Laravel 422 => { message, errors: {campo:[...]} })
  let detail = ''
  try {
    const j = await res.json()
    detail = j?.message || j?.error || ''
    if (j?.errors && typeof j.errors === 'object') {
      const flat = Object.values(j.errors as Record<string, string[]>).flat().filter(Boolean)
      if (flat.length) detail = `${detail ? detail + ' — ' : ''}${flat.join('; ')}`
    }
  } catch { /* ignore */ }
  return { ok: false, status: res.status, detail }
}

async function searchEscavadorAPI(name: string, cpf: string | null, token: string): Promise<SearchResult> {
  const snippets: string[] = []
  const urls: string[] = []
  const cpfFmt = cpf ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : null

  // Tenta em sequência formatos aceitos; usa o primeiro que retornar 200.
  const attempts: string[] = []
  if (cpf) {
    attempts.push(`cpf_cnpj=${encodeURIComponent(cpf)}`)                 // dígitos
    if (cpfFmt) attempts.push(`cpf_cnpj=${encodeURIComponent(cpfFmt)}`)  // formatado
  }
  if (name) attempts.push(`nome=${encodeURIComponent(name)}`)            // por nome (fallback)

  try {
    let data: Record<string, unknown> | null = null
    let lastStatus = 0
    let lastDetail = ''

    for (const qs of attempts) {
      const r = await escavadorAttempt(qs, token)
      if (r.ok) { data = r.data; break }
      lastStatus = r.status; lastDetail = r.detail
      // Erros que não adianta repetir com outro formato:
      if (r.status === 401 || r.status === 403 || r.status === 402) break
    }

    if (!data) {
      if (lastStatus === 401 || lastStatus === 403) {
        return { source: 'Escavador (API)', snippets: ['Falha de autenticação na API do Escavador. Verifique a chave em Configuração de IA.'], urls: [] }
      }
      if (lastStatus === 402) {
        return { source: 'Escavador (API)', snippets: ['A consulta ao Escavador requer créditos/plano ativo (HTTP 402). Verifique o saldo da sua conta em escavador.com.'], urls: [] }
      }
      if (lastStatus === 404) {
        return { source: 'Escavador (API)', snippets: ['Nenhum processo encontrado na base do Escavador para este envolvido.'], urls: [] }
      }
      return { source: 'Escavador (API)', snippets: [`API do Escavador retornou erro ${lastStatus}${lastDetail ? ': ' + lastDetail : ''}.`], urls: [] }
    }

    // A resposta pode vir como { items: [...] } ou { resposta: {...} }
    const d = data as { items?: unknown[]; resposta?: { items?: unknown[] }; processos?: unknown[]; links?: { next?: unknown } }
    const items: Record<string, unknown>[] = (Array.isArray(d.items) ? d.items
      : Array.isArray(d.resposta?.items) ? d.resposta!.items
      : Array.isArray(d.processos) ? d.processos
      : []) as Record<string, unknown>[]

    if (items.length === 0) {
      snippets.push('Nenhum processo encontrado na base do Escavador para este envolvido.')
    } else {
      snippets.push(`Total de processos encontrados no Escavador: ${items.length}${d.links?.next ? '+ (há mais páginas)' : ''}.`)
      for (const p of items.slice(0, 25)) {
        const numero = (p.numero_cnj || p.numero || p.numeroProcessoUnico || '') as string
        const ativo = (p.titulo_polo_ativo || p.polo_ativo || '') as string
        const passivo = (p.titulo_polo_passivo || p.polo_passivo || '') as string
        const dataInicio = (p.data_inicio || p.ano_inicio || '') as string
        // fontes/tribunais
        const fontes = Array.isArray(p.fontes) ? p.fontes as Record<string, unknown>[] : []
        const tribunal = fontes.map(f => (f.nome || f.sigla || '') as string).filter(Boolean).join(', ')
        const capa = fontes.map(f => f.capa as Record<string, unknown> | undefined).find(Boolean)
        const classe = (capa?.classe || p.classe || '') as string
        const assuntoObj = capa?.assunto_principal as Record<string, unknown> | undefined
        const assunto = (assuntoObj?.nome || p.assunto || '') as string

        const parts = [
          numero ? `Processo ${numero}` : 'Processo (sem número)',
          tribunal && `Tribunal: ${tribunal}`,
          classe && `Classe: ${classe}`,
          assunto && `Assunto: ${assunto}`,
          (ativo || passivo) && `Partes: ${ativo}${ativo && passivo ? ' x ' : ''}${passivo}`,
          dataInicio && `Início: ${dataInicio}`,
        ].filter(Boolean)
        snippets.push(parts.join(' — '))
      }
    }
  } catch (e) {
    snippets.push(`Não foi possível consultar a API do Escavador (${(e as Error).name === 'AbortError' ? 'tempo esgotado' : 'erro de rede'}).`)
  }

  return { source: 'Escavador (API)', snippets, urls }
}

// ─── Escavador (scraping — fallback sem chave de API) ──────────────────────────
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

  // ── Tentativa 2: URL direta de perfil CPF no Escavador ──────────────────
  // Escavador expõe perfis em URLs previsíveis: /cpf/XXX.XXX.XXX-XX
  if (!directSucceeded && cpfFmt) {
    try {
      const directCpfUrl = `https://www.escavador.com/cpf/${encodeURIComponent(cpfFmt)}`
      allUrls.push(directCpfUrl)
      const cpfRes = await fetchWithTimeout(directCpfUrl, {
        headers: { ...BROWSER_HEADERS, Referer: 'https://www.escavador.com/' },
      }, 5000)
      if (cpfRes.ok) {
        const cpfHtml = await cpfRes.text()
        const cpfSnips = parseEscavadorPage(cpfHtml)
        if (cpfSnips.length > 0) {
          directSucceeded = true
          allSnippets.push(...cpfSnips)
        }
      }
    } catch { /* skip */ }
  }

  // ── Tentativa 3: fallback via DuckDuckGo + Google (paralelo) ─────────────
  // DuckDuckGo HTML (html.duckduckgo.com) não exige JS e é muito mais
  // acessível de IPs de servidor (Vercel) que Google.
  // Google fica como segunda opção caso DDG também falhe.
  if (!directSucceeded) {
    const fallbackSearches = [
      // DuckDuckGo — filtrado para Escavador
      ...(cpfFmt
        ? [searchDuckDuckGo(`"${cpfFmt}" site:escavador.com`, 'escavador.com')]
        : []),
      searchDuckDuckGo(`"${name}" processos escavador`, 'escavador.com'),
      // DuckDuckGo — busca ampla por processos judiciais
      searchDuckDuckGo(
        cpfFmt
          ? `"${cpfFmt}" processos judiciais Brasil`
          : `"${name}" processos judiciais antecedentes`
      ),
      // Google — mantido como fallback adicional
      ...(cpfFmt
        ? [searchGoogle(`"${cpfFmt}" site:escavador.com`, 'escavador.com')]
        : []),
      searchGoogle(
        cpfFmt
          ? `"${cpfFmt}" processos judiciais`
          : `"${name}" processos judiciais antecedentes`
      ),
    ]

    const fallbackResults = await Promise.allSettled(fallbackSearches)
    for (const r of fallbackResults) {
      if (r.status !== 'fulfilled') continue
      allSnippets.push(...r.value.snippets)
      allUrls.push(...r.value.urls)
    }
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
        ? `Processos encontrados na consulta ao Escavador.`
        : 'Nenhum processo encontrado no Escavador para este candidato.',
      detalhes: processSnippets.slice(0, 20),
      urls: uniqueUrls,
    },
    beneficios_governamentais: { encontrado: false, lista: [], resumo: 'Não verificado.' },
    outras_informacoes: { items: [], resumo: '' },
    parecer_geral: hasProcesses
      ? `Processos encontrados no Escavador. Configure uma chave de IA em Configurações → Configuração IA para análise detalhada.`
      : 'Nenhum processo judicial encontrado no Escavador para este candidato.',
    nivel_risco: hasProcesses ? 'nao_determinado' : 'baixo',
    fontes_consultadas: ['Escavador'],
    observacoes_tecnicas: hasProcesses
      ? 'Configure uma chave de IA para análise inteligente dos processos encontrados.'
      : 'Consulta realizada exclusivamente via API do Escavador.',
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

━━━ FONTE CONSULTADA ━━━
• Escavador (API oficial v2): consulta de processos do envolvido por ${usedCpf ? `CPF ${cpfFormatted} (identificador único)` : `nome "${name}"`}. Dados estruturados retornados diretamente pela API.

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
  "fontes_consultadas": ["Escavador"],
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

    // ── Busca — exclusivamente Escavador (API oficial v2) ──────────────────────
    const escavadorToken = await getEscavadorKey()
    if (!escavadorToken) {
      return NextResponse.json({
        error: 'Chave de API do Escavador não configurada. Configure em Configurações da plataforma → Configuração IA.',
      }, { status: 400 })
    }

    const escavadorR = await searchEscavadorAPI(full_name, cpfClean, escavadorToken)
    const results: SearchResult[] = [escavadorR]

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
