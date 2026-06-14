import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { AuxiliosCheckResult, AuxilioItem } from '@/types'

export const maxDuration = 45

const API = 'https://api.portaldatransparencia.gov.br/api-de-dados'

async function fetchJSON(url: string, token: string, ms = 9000): Promise<{ ok: boolean; status: number; data: unknown; detail?: string }> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, {
      headers: {
        'chave-api-dados': token,
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      signal: ctrl.signal,
    })
    const text = await res.text()
    let data: unknown = null
    try { data = JSON.parse(text) } catch { /* não-JSON */ }
    const detail = !res.ok ? (((data as Record<string, unknown>)?.message as string) || text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)) : undefined
    return { ok: res.ok, status: res.status, data, detail }
  } catch {
    return { ok: false, status: 0, data: null }
  } finally { clearTimeout(t) }
}

/** Últimos N meses no formato YYYYMM. */
function recentMonths(n: number): string[] {
  const out: string[] = []
  const d = new Date()
  for (let i = 0; i < n; i++) {
    const y = d.getFullYear(), m = d.getMonth() + 1
    out.push(`${y}${String(m).padStart(2, '0')}`)
    d.setMonth(d.getMonth() - 1)
  }
  return out
}

function brl(v: unknown): string | undefined {
  const n = Number(v)
  if (!isFinite(n) || n <= 0) return undefined
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  'X-Requested-With': 'XMLHttpRequest',
  Referer: 'https://portaldatransparencia.gov.br/busca',
}

/** Consulta pública (sem chave de API) — usa os endpoints internos do site. Melhor esforço. */
async function publicConsulta(cpf: string, name: string): Promise<AuxiliosCheckResult> {
  const portalLink = `https://portaldatransparencia.gov.br/busca?termo=${cpf}`
  const baseResult = (extra: Partial<AuxiliosCheckResult> = {}): AuxiliosCheckResult => ({
    encontrado: false, recebendo: false,
    resumo: 'Nenhum auxílio governamental encontrado para este CPF no Portal da Transparência.',
    beneficios: [], fontes_consultadas: ['Portal da Transparência (consulta pública)'],
    observacao: `Consulta sem chave de API (melhor esforço). Para confirmação, acesse: ${portalLink}`,
    ...extra,
  })

  try {
    // 1) Busca a pessoa física pelo CPF (endpoint interno do site)
    const url = `https://portaldatransparencia.gov.br/pessoa-fisica/busca/resultado?termo=${encodeURIComponent(cpf)}&pagina=1&tamanhoPagina=10`
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 9000)
    let data: unknown = null
    let blocked = false
    try {
      const res = await fetch(url, { headers: BROWSER_HEADERS, signal: ctrl.signal })
      if (res.ok) { try { data = await res.json() } catch { blocked = true } }
      else blocked = true
    } catch { blocked = true } finally { clearTimeout(t) }

    if (blocked) {
      return baseResult({
        resumo: 'Não foi possível consultar automaticamente sem chave de API (o Portal bloqueou a requisição).',
        observacao: `Consulte manualmente no Portal da Transparência: ${portalLink}. Para automação confiável, configure a chave gratuita da API em Configuração IA.`,
      })
    }

    // Estruturas possíveis: { data: [...] } | { registros: [...] } | [...]
    const d = data as { data?: unknown[]; registros?: unknown[] }
    const list: Record<string, unknown>[] = (Array.isArray(d?.data) ? d.data
      : Array.isArray(d?.registros) ? d.registros
      : Array.isArray(data) ? data : []) as Record<string, unknown>[]

    // tenta achar a pessoa correspondente ao CPF (cpf vem mascarado: ***.xxx.xxx-**)
    const masked = cpf.slice(3, 9) // 6 dígitos do meio aparecem no cpfFormatado
    const person = list.find(p => String((p as Record<string, unknown>).cpfFormatado || '').replace(/\D/g, '').includes(masked)) || list[0]

    if (!person) return baseResult()

    // flags de benefício no resultado de busca (variam conforme o portal)
    const flags = JSON.stringify(person).toLowerCase()
    const beneficios: AuxilioItem[] = []
    const programMap: [RegExp, string][] = [
      [/bolsa\s*fam[ií]lia/, 'Bolsa Família / Novo Bolsa Família'],
      [/\bbpc\b|presta[çc][ãa]o continuada/, 'BPC'],
      [/aux[ií]lio\s*emergencial/, 'Auxílio Emergencial'],
      [/aux[ií]lio\s*brasil/, 'Auxílio Brasil'],
      [/seguro\s*defeso/, 'Seguro Defeso'],
      [/garantia\s*safra/, 'Garantia-Safra'],
    ]
    for (const [re, label] of programMap) {
      if (re.test(flags)) beneficios.push({ programa: label, situacao: 'indefinido', detalhe: 'Indício encontrado na busca pública (confirme no Portal).' })
    }

    const apareceComoBeneficiario = /beneficiario|benef[ií]cio|bolsa|bpc|emergencial|defeso|safra/.test(flags)
    const encontrado = beneficios.length > 0 || apareceComoBeneficiario

    return baseResult({
      encontrado,
      recebendo: false, // sem a API não dá para afirmar com segurança o mês corrente
      resumo: encontrado
        ? `${name} aparece no Portal da Transparência possivelmente como beneficiário de programa social. Confirme os detalhes no link.`
        : 'Nenhum indício de auxílio governamental encontrado na busca pública para este CPF.',
      beneficios,
    })
  } catch {
    return baseResult({
      resumo: 'Não foi possível consultar automaticamente sem chave de API.',
      observacao: `Consulte manualmente: ${portalLink}`,
    })
  }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await createSupabaseServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

    const supabase = await createSupabaseServiceClient()
    const { data: candidate } = await supabase.from('candidates').select('full_name, cpf').eq('id', id).single()
    if (!candidate) return NextResponse.json({ error: 'Candidato não encontrado.' }, { status: 404 })
    const cpf = (candidate.cpf as string | null)?.replace(/\D/g, '') || null
    if (!cpf || cpf.length !== 11) {
      return NextResponse.json({ error: 'Candidato sem CPF válido cadastrado — necessário para consultar auxílios.' }, { status: 400 })
    }

    const { data: settings } = await supabase.from('ai_settings').select('transparencia_api_key').limit(1).single()
    const token = (settings?.transparencia_api_key as string | null)?.trim() || process.env.TRANSPARENCIA_API_KEY || null

    // ── Sem chave de API: consulta pública (melhor esforço, sem chave) ─────────
    if (!token) {
      const pub = await publicConsulta(cpf, candidate.full_name as string)
      await supabase.from('candidates').update({
        auxilios_check_result: pub,
        auxilios_check_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', id)
      return NextResponse.json({ success: true, result: pub })
    }

    const beneficios: AuxilioItem[] = []
    const fontes = new Set<string>()
    let recebendo = false
    let rateLimited = false
    let authError = false

    const months = recentMonths(4)

    // ── Programas mensais (situação atual): Novo Bolsa Família, BPC ──────────────
    const monthlyPrograms: { label: string; path: (m: string) => string }[] = [
      { label: 'Novo Bolsa Família', path: m => `${API}/novo-bolsa-familia-por-cpf-ou-nis?codigo=${cpf}&anoMesReferencia=${m}&pagina=1` },
      { label: 'BPC (Benefício de Prestação Continuada)', path: m => `${API}/bpc-por-cpf-ou-nis?codigo=${cpf}&anoMesReferencia=${m}&pagina=1` },
      { label: 'Bolsa Família', path: m => `${API}/bolsa-familia-disponivel-por-cpf-ou-nis?codigo=${cpf}&anoMesReferencia=${m}&pagina=1` },
    ]

    let authStatus = 0
    let authDetail = ''
    for (const prog of monthlyPrograms) {
      let hitMonth: string | null = null
      let valor: string | undefined
      for (const m of months) {
        const r = await fetchJSON(prog.path(m), token)
        if (r.status === 401 || r.status === 403) { authError = true; authStatus = r.status; authDetail = r.detail || ''; break }
        if (r.status === 429) { rateLimited = true; break }
        if (r.ok && Array.isArray(r.data) && r.data.length > 0) {
          fontes.add(prog.label)
          const first = r.data[0] as Record<string, unknown>
          valor = brl(first?.valor ?? first?.valorSaque ?? (first as Record<string, unknown>)?.['valorBeneficio'])
          if (!hitMonth) hitMonth = m
          break // achou no mês mais recente disponível
        }
      }
      if (authError || rateLimited) break
      if (hitMonth) {
        recebendo = true
        const ym = `${hitMonth.slice(4, 6)}/${hitMonth.slice(0, 4)}`
        beneficios.push({ programa: prog.label, situacao: 'recebendo', periodo: ym, valor, detalhe: `Benefício ativo em ${ym}.` })
      }
    }

    // ── Programas históricos (recebeu no passado) ───────────────────────────────
    if (!authError && !rateLimited) {
      // Auxílio Emergencial (2020-2021)
      const ae = await fetchJSON(`${API}/auxilio-emergencial-por-cpf-ou-nis?codigoBeneficiario=${cpf}&pagina=1`, token)
      if (ae.status === 401 || ae.status === 403) authError = true
      else if (ae.status === 429) rateLimited = true
      else if (ae.ok && Array.isArray(ae.data) && ae.data.length > 0) {
        fontes.add('Auxílio Emergencial')
        beneficios.push({ programa: 'Auxílio Emergencial (2020-2021)', situacao: 'recebeu', detalhe: 'Recebeu auxílio emergencial.' })
      }
    }

    if (!authError && !rateLimited) {
      // Auxílio Brasil (2021-2022) — consulta um mês representativo
      const ab = await fetchJSON(`${API}/auxilio-brasil-disponivel-por-cpf-ou-nis?codigo=${cpf}&anoMesReferencia=202212&pagina=1`, token)
      if (ab.ok && Array.isArray(ab.data) && ab.data.length > 0) {
        fontes.add('Auxílio Brasil')
        beneficios.push({ programa: 'Auxílio Brasil (2021-2022)', situacao: 'recebeu', detalhe: 'Recebeu Auxílio Brasil.' })
      }
    }

    if (authError) {
      const base = authStatus === 403
        ? 'O Portal da Transparência recusou a requisição (HTTP 403). Isso costuma ser bloqueio do servidor à origem da consulta ou chave sem permissão.'
        : 'Falha de autenticação na API do Portal da Transparência (HTTP 401) — verifique se a chave está correta e ativa.'
      const tip = ' Gere/valide a chave gratuita em portaldatransparencia.gov.br/api-de-dados/cadastrar-email e cole em Configurações → Configuração IA.'
      return NextResponse.json({ error: `${base}${authDetail ? ` Detalhe: ${authDetail}.` : ''}${tip}` }, { status: 400 })
    }

    const encontrado = beneficios.length > 0
    const result: AuxiliosCheckResult = {
      encontrado,
      recebendo,
      resumo: encontrado
        ? (recebendo
            ? `${candidate.full_name} consta como beneficiário ATIVO de programa social.`
            : `${candidate.full_name} recebeu auxílio governamental no passado, sem benefício ativo identificado nos meses recentes.`)
        : 'Nenhum auxílio governamental encontrado para este CPF no Portal da Transparência.',
      beneficios,
      fontes_consultadas: Array.from(fontes).length ? Array.from(fontes) : ['Portal da Transparência'],
      observacao: rateLimited
        ? 'A consulta atingiu o limite de requisições da API e pode estar incompleta. Tente novamente em alguns minutos.'
        : undefined,
    }

    await supabase.from('candidates').update({
      auxilios_check_result: result,
      auxilios_check_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', id)

    return NextResponse.json({ success: true, result })
  } catch (err) {
    console.error('[auxilios-check]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
