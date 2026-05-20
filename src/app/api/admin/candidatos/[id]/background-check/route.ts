import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { BackgroundCheckResult } from '@/types'

// ─── Timeout wrapper ──────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, options: RequestInit = {}, ms = 9000): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...options, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

// ─── Strip HTML tags and normalize whitespace ─────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// ─── DuckDuckGo HTML search ───────────────────────────────────────────────────

async function searchDDG(query: string): Promise<{ snippets: string[]; urls: string[] }> {
  try {
    const res = await fetchWithTimeout(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=br-pt`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'pt-BR,pt;q=0.9',
          'Accept': 'text/html,application/xhtml+xml',
        },
      },
      10000,
    )
    if (!res.ok) return { snippets: [], urls: [] }

    const html = await res.text()

    // Extract snippets from DDG result blocks
    const snippetMatches = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi)]
    const snippets = snippetMatches
      .map(m => stripHtml(m[1]).trim())
      .filter(s => s.length > 15)
      .slice(0, 6)

    // Extract URLs
    const urlMatches = [...html.matchAll(/class="result__url"[^>]*>([\s\S]*?)<\/span>/gi)]
    const urls = urlMatches
      .map(m => stripHtml(m[1]).trim())
      .filter(Boolean)
      .slice(0, 6)

    return { snippets, urls }
  } catch {
    return { snippets: [], urls: [] }
  }
}

// ─── Portal da Transparência search ──────────────────────────────────────────

async function searchTransparencia(query: string): Promise<string> {
  try {
    const res = await fetchWithTimeout(
      `https://portaldatransparencia.gov.br/beneficios/consulta?termo=${encodeURIComponent(query)}&pagina=1`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html',
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
      },
      10000,
    )
    if (!res.ok) return ''
    const html = await res.text()
    const text = stripHtml(html)
    // Extract relevant section (first 2000 chars around relevant keywords)
    const idx = text.search(/benefício|auxílio|bolsa|cadastro/i)
    if (idx === -1) return text.slice(0, 1000)
    return text.slice(Math.max(0, idx - 200), idx + 1500)
  } catch {
    return ''
  }
}

// ─── Compile AI prompt ────────────────────────────────────────────────────────

function buildPrompt(
  candidateName: string,
  cpf: string | null,
  city: string | null,
  searches: Array<{ label: string; snippets: string[]; urls: string[] }>,
  transparenciaText: string,
): string {
  const cpfFormatted = cpf
    ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    : 'Não informado'

  const searchBlocks = searches
    .map(s => {
      if (!s.snippets.length && !s.urls.length) return `\n[${s.label}]\nNenhum resultado encontrado.\n`
      const content = s.snippets
        .map((snippet, i) => `  ${s.urls[i] ? `[${s.urls[i]}]` : ''} ${snippet}`)
        .join('\n')
      return `\n[${s.label}]\n${content}\n`
    })
    .join('')

  return `Você é um analista de background check especializado para processos seletivos no Brasil.

Analise os resultados abaixo sobre o candidato e produza um relatório JSON estruturado.

DADOS DO CANDIDATO:
- Nome completo: ${candidateName}
- CPF: ${cpfFormatted}
- Cidade: ${city || 'Não informada'}

RESULTADOS DAS BUSCAS NA INTERNET:
${searchBlocks}

PORTAL DA TRANSPARÊNCIA:
${transparenciaText || 'Sem dados disponíveis'}

INSTRUÇÕES:
- Identifique menções a processos judiciais (cíveis, criminais, trabalhistas, etc.)
- Identifique benefícios governamentais (Bolsa Família, BPC, Seguro Desemprego, etc.)
- Identifique outras informações relevantes para um processo seletivo
- Seja criterioso: apenas confirme o que há evidência explícita nos resultados
- Se não houver evidências claras, classifique como "não encontrado" e nível "nao_determinado"
- Ignore resultados que claramente são de outras pessoas com nome similar
- Use CPF para confirmar identidade quando disponível nos resultados

Retorne APENAS um objeto JSON válido com esta estrutura exata:
{
  "processos_judiciais": {
    "encontrado": false,
    "resumo": "string descritiva",
    "detalhes": ["detalhe 1", "detalhe 2"],
    "urls": ["https://..."]
  },
  "beneficios_governamentais": {
    "encontrado": false,
    "lista": ["Bolsa Família", "..."],
    "resumo": "string descritiva"
  },
  "outras_informacoes": {
    "items": ["informação relevante 1", "..."],
    "resumo": "string descritiva ou 'Nenhuma informação adicional encontrada'"
  },
  "parecer_geral": "Resumo executivo em 1-2 frases para o recrutador",
  "nivel_risco": "baixo",
  "fontes_consultadas": ["JusBrasil", "Escavador", "Portal da Transparência"],
  "observacoes_tecnicas": "Limitações encontradas na pesquisa, se houver"
}

Valores válidos para nivel_risco: "baixo", "medio", "alto", "nao_determinado"
Retorne SOMENTE o JSON, sem markdown, sem explicações adicionais.`
}

// ─── Call AI (Anthropic or OpenAI) ───────────────────────────────────────────

async function callAI(prompt: string, supabase: Awaited<ReturnType<typeof createSupabaseServiceClient>>): Promise<BackgroundCheckResult> {
  const { data: aiSettings } = await supabase
    .from('ai_settings')
    .select('anthropic_api_key_encrypted, openai_api_key_encrypted')
    .limit(1)
    .single()

  // Try Anthropic first
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
            max_tokens: 1500,
            messages: [{ role: 'user', content: prompt }],
          }),
        },
        30000,
      )
      if (res.ok) {
        const data = await res.json()
        const text = data?.content?.[0]?.text || ''
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) return JSON.parse(jsonMatch[0]) as BackgroundCheckResult
      }
    } catch { /* fallthrough */ }
  }

  // Try OpenAI
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
            max_tokens: 1500,
            response_format: { type: 'json_object' },
            messages: [{ role: 'user', content: prompt }],
          }),
        },
        30000,
      )
      if (res.ok) {
        const data = await res.json()
        const text = data?.choices?.[0]?.message?.content || ''
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) return JSON.parse(jsonMatch[0]) as BackgroundCheckResult
      }
    } catch { /* fallthrough */ }
  }

  // Fallback: no AI configured
  return {
    processos_judiciais: { encontrado: false, resumo: 'Análise não disponível — nenhuma chave de IA configurada.', detalhes: [], urls: [] },
    beneficios_governamentais: { encontrado: false, lista: [], resumo: 'Análise não disponível.' },
    outras_informacoes: { items: [], resumo: 'Análise não disponível.' },
    parecer_geral: 'Não foi possível realizar a análise automática. Configure uma chave de IA em Configurações → IA.',
    nivel_risco: 'nao_determinado',
    fontes_consultadas: [],
    observacoes_tecnicas: 'Nenhuma chave de IA (Anthropic ou OpenAI) configurada na plataforma.',
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    // Auth check
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

    const supabase = await createSupabaseServiceClient()

    // Fetch candidate data
    const { data: candidate } = await supabase
      .from('candidates')
      .select('full_name, cpf, city, phone')
      .eq('id', id)
      .single()

    if (!candidate) return NextResponse.json({ error: 'Candidato não encontrado.' }, { status: 404 })

    const { full_name, cpf, city } = candidate
    const cpfClean = cpf?.replace(/\D/g, '') || null

    // ── Run all searches in parallel ──────────────────────────────────────────
    const [
      processosResult,
      escavadorResult,
      transparenciaBeneficiosResult,
      generalResult,
    ] = await Promise.allSettled([
      // 1. Processos judiciais no JusBrasil
      searchDDG(`"${full_name}" site:jusbrasil.com.br`),
      // 2. Perfil no Escavador
      searchDDG(`"${full_name}" site:escavador.com`),
      // 3. Benefícios no Portal da Transparência
      searchTransparencia(cpfClean || full_name),
      // 4. Busca geral: trabalhista, criminal, auxílios
      searchDDG(`"${full_name}" ${city ? `"${city}"` : ''} ${cpfClean ? `"${cpfClean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}"` : ''} processos judicial auxílio governo`),
    ])

    const processos    = processosResult.status === 'fulfilled' ? processosResult.value : { snippets: [], urls: [] }
    const escavador    = escavadorResult.status === 'fulfilled' ? escavadorResult.value : { snippets: [], urls: [] }
    const transparencia = transparenciaBeneficiosResult.status === 'fulfilled' ? transparenciaBeneficiosResult.value : ''
    const general      = generalResult.status === 'fulfilled' ? generalResult.value : { snippets: [], urls: [] }

    // ── Build prompt and call AI ──────────────────────────────────────────────
    const prompt = buildPrompt(
      full_name,
      cpfClean,
      city,
      [
        { label: 'JusBrasil (processos)', snippets: processos.snippets, urls: processos.urls },
        { label: 'Escavador (perfil público)', snippets: escavador.snippets, urls: escavador.urls },
        { label: 'Busca geral (processos + auxílios)', snippets: general.snippets, urls: general.urls },
      ],
      transparencia,
    )

    const result = await callAI(prompt, supabase)

    // Adiciona URLs encontradas aos processos
    const allProcessUrls = [
      ...processos.urls.filter(u => u.includes('jusbrasil')),
      ...escavador.urls.filter(u => u.includes('escavador')),
    ]
    if (allProcessUrls.length > 0 && result.processos_judiciais) {
      result.processos_judiciais.urls = [
        ...(result.processos_judiciais.urls || []),
        ...allProcessUrls,
      ].slice(0, 5)
    }

    // ── Store result in DB ────────────────────────────────────────────────────
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
