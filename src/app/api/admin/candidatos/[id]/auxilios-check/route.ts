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

/**
 * Procura recursivamente o primeiro campo "nis" (11 dígitos) numa resposta da API.
 * O NIS é necessário para consultar Novo Bolsa Família e Auxílio Brasil, cujos
 * endpoints só aceitam NIS (não CPF).
 */
function extractNis(data: unknown): string | null {
  const stack: unknown[] = [data]
  while (stack.length) {
    const cur = stack.pop()
    if (Array.isArray(cur)) { for (const v of cur) stack.push(v); continue }
    if (cur && typeof cur === 'object') {
      for (const [k, v] of Object.entries(cur as Record<string, unknown>)) {
        if (k.toLowerCase() === 'nis' && typeof v === 'string' && /^\d{11}$/.test(v)) return v
        if (v && typeof v === 'object') stack.push(v)
      }
    }
  }
  return null
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
    let authError = false // chave inválida/inexistente (HTTP 401)
    let consultouAlgo = false // ao menos um endpoint respondeu 2xx
    let authDetail = ''
    let nis: string | null = null // NIS do beneficiário (necessário p/ Novo Bolsa Família e Auxílio Brasil)

    const months = recentMonths(4)

    // ── 1) BPC — benefício contínuo, situação ATUAL (endpoint aceita CPF) ────────
    {
      let hitMonth: string | null = null
      let valor: string | undefined
      for (const m of months) {
        const r = await fetchJSON(`${API}/bpc-por-cpf-ou-nis?codigo=${cpf}&anoMesReferencia=${m}&pagina=1`, token)
        if (r.status === 401) { authError = true; authDetail = r.detail || ''; break }
        if (r.status === 429) { rateLimited = true; break }
        if (r.ok) {
          consultouAlgo = true
          nis ||= extractNis(r.data)
          if (Array.isArray(r.data) && r.data.length > 0) {
            const first = r.data[0] as Record<string, unknown>
            valor = brl(first?.valor ?? first?.valorSaque ?? first?.['valorBeneficio'])
            hitMonth = m; break
          }
        }
      }
      if (hitMonth) {
        recebendo = true
        const ym = `${hitMonth.slice(4, 6)}/${hitMonth.slice(0, 4)}`
        beneficios.push({ programa: 'BPC (Benefício de Prestação Continuada)', situacao: 'recebendo', periodo: ym, valor, detalhe: `Benefício ativo em ${ym}.` })
      }
    }

    // ── 2) Auxílio Emergencial 2020-2021 (endpoint aceita CPF) ──────────────────
    if (!authError && !rateLimited) {
      const ae = await fetchJSON(`${API}/auxilio-emergencial-por-cpf-ou-nis?codigoBeneficiario=${cpf}&pagina=1`, token)
      if (ae.status === 401) { authError = true; authDetail = authDetail || ae.detail || '' }
      else if (ae.status === 429) rateLimited = true
      else if (ae.ok) {
        consultouAlgo = true
        nis ||= extractNis(ae.data)
        if (Array.isArray(ae.data) && ae.data.length > 0) {
          fontes.add('Auxílio Emergencial')
          beneficios.push({ programa: 'Auxílio Emergencial (2020-2021)', situacao: 'recebeu', detalhe: 'Recebeu auxílio emergencial.' })
        }
      }
    }

    // ── 3) Bolsa Família "clássico" (até out/2021) — varredura histórica (CPF) ──
    // O endpoint "disponível" aceita CPF e responde 200 nos meses em que o programa
    // existiu. Varremos meses descendentes (denso em 2021, trimestral antes) e
    // paramos no 1º registro. Também extrai o NIS, usado nos passos 4a/4b.
    if (!authError && !rateLimited) {
      const bfMonths: string[] = []
      for (let y = 2021; y >= 2019; y--) {
        const maxM = y === 2021 ? 10 : 12 // programa encerrou em out/2021
        for (let m = maxM; m >= 1; m--) {
          if (y === 2021 || m % 3 === 1) bfMonths.push(`${y}${String(m).padStart(2, '0')}`)
        }
      }
      for (const m of bfMonths) {
        const r = await fetchJSON(`${API}/bolsa-familia-disponivel-por-cpf-ou-nis?codigo=${cpf}&anoMesReferencia=${m}&pagina=1`, token)
        if (r.status === 401) { authError = true; authDetail = authDetail || r.detail || ''; break }
        if (r.status === 429) { rateLimited = true; break }
        if (r.ok) {
          consultouAlgo = true
          nis ||= extractNis(r.data)
          if (Array.isArray(r.data) && r.data.length > 0) {
            const first = r.data[0] as Record<string, unknown>
            const valor = brl(first?.valor ?? first?.valorSaque ?? first?.['valorBeneficio'])
            const ym = `${m.slice(4, 6)}/${m.slice(0, 4)}`
            fontes.add('Bolsa Família')
            beneficios.push({ programa: 'Bolsa Família (até 2021)', situacao: 'recebeu', periodo: ym, valor, detalhe: `Recebeu Bolsa Família (registro em ${ym}).` })
            break // basta um registro para confirmar que recebeu
          }
        }
      }
    }

    // ── 4) Programas que SÓ aceitam NIS (precisamos do NIS dos passos anteriores) ─
    //   4a) Novo Bolsa Família — programa ATUAL ("continua recebendo?")
    //   4b) Auxílio Brasil — transição nov/2021 a dez/2022
    let nisIndisponivel = false
    if (!authError && !rateLimited && !nis) {
      // Sem NIS não é possível consultar Novo Bolsa Família / Auxílio Brasil.
      // Só sinalizamos isso se o CPF realmente puder ser beneficiário (nada encontrado
      // nos programas abertos => provavelmente não é beneficiário, sem necessidade de aviso).
      nisIndisponivel = beneficios.length > 0
    }

    if (!authError && !rateLimited && nis) {
      // 4a) Novo Bolsa Família — varre os últimos 12 meses; 1º hit = registro mais recente
      const nbfMonths = recentMonths(12)
      for (let i = 0; i < nbfMonths.length; i++) {
        const m = nbfMonths[i]
        const r = await fetchJSON(`${API}/novo-bolsa-familia-sacado-por-nis?nis=${nis}&anoMesReferencia=${m}&pagina=1`, token)
        if (r.status === 401) { authError = true; authDetail = authDetail || r.detail || ''; break }
        if (r.status === 429) { rateLimited = true; break }
        if (r.ok) {
          consultouAlgo = true
          if (Array.isArray(r.data) && r.data.length > 0) {
            const first = r.data[0] as Record<string, unknown>
            const valor = brl(first?.valorSaque ?? first?.valor)
            const ym = `${m.slice(4, 6)}/${m.slice(0, 4)}`
            const ativo = i < 3 // registro num dos 3 meses mais recentes → considera ativo
            if (ativo) recebendo = true
            fontes.add('Novo Bolsa Família')
            beneficios.push({
              programa: 'Novo Bolsa Família',
              situacao: ativo ? 'recebendo' : 'recebeu',
              periodo: ym, valor,
              detalhe: ativo ? `Benefício ativo (último registro em ${ym}).` : `Recebeu (último registro em ${ym}).`,
            })
            break
          }
        }
      }
    }

    if (!authError && !rateLimited && nis) {
      // 4b) Auxílio Brasil — nov/2021 a dez/2022
      const abMonths = ['202212', '202211', '202210', '202209', '202208', '202207', '202206', '202205', '202204', '202203', '202202', '202201', '202112', '202111']
      for (const m of abMonths) {
        const r = await fetchJSON(`${API}/auxilio-brasil-sacado-por-nis?nis=${nis}&anoMesReferencia=${m}&pagina=1`, token)
        if (r.status === 401) { authError = true; authDetail = authDetail || r.detail || ''; break }
        if (r.status === 429) { rateLimited = true; break }
        if (r.ok) {
          consultouAlgo = true
          if (Array.isArray(r.data) && r.data.length > 0) {
            const first = r.data[0] as Record<string, unknown>
            const valor = brl(first?.valorSaque ?? first?.valor)
            const ym = `${m.slice(4, 6)}/${m.slice(0, 4)}`
            fontes.add('Auxílio Brasil')
            beneficios.push({ programa: 'Auxílio Brasil (2021-2022)', situacao: 'recebeu', periodo: ym, valor, detalhe: `Recebeu Auxílio Brasil (registro em ${ym}).` })
            break
          }
        }
      }
    }

    // HTTP 401 = chave inválida/inexistente → erro real.
    if (authError) {
      const tip = ' Gere/valide a chave gratuita em portaldatransparencia.gov.br/api-de-dados/cadastrar-email e cole em Configurações → Configuração IA.'
      return NextResponse.json({ error: `Falha de autenticação na API do Portal da Transparência (HTTP 401) — a chave parece inválida ou inativa.${authDetail ? ` Detalhe: ${authDetail}.` : ''}${tip}` }, { status: 400 })
    }

    const obsPartes: string[] = []
    if (nisIndisponivel) {
      obsPartes.push('Não foi possível localizar o NIS deste CPF nos programas de acesso aberto; por isso Novo Bolsa Família e Auxílio Brasil (que só podem ser consultados por NIS) não foram verificados.')
    }
    if (rateLimited) {
      obsPartes.push('A consulta atingiu o limite de requisições da API e pode estar incompleta. Tente novamente em alguns minutos.')
    }

    const encontrado = beneficios.length > 0
    const result: AuxiliosCheckResult = {
      encontrado,
      recebendo,
      resumo: encontrado
        ? (recebendo
            ? `${candidate.full_name} consta como beneficiário ATIVO de programa social.`
            : `${candidate.full_name} recebeu auxílio governamental no passado, sem benefício ativo identificado nos meses recentes.`)
        : 'Nenhum auxílio governamental encontrado para este CPF nos programas verificados do Portal da Transparência.',
      beneficios,
      fontes_consultadas: Array.from(fontes).length ? Array.from(fontes) : ['Portal da Transparência'],
      observacao: obsPartes.length ? obsPartes.join(' ') : undefined,
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
