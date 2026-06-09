import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { AuxiliosCheckResult, AuxilioItem } from '@/types'

export const maxDuration = 45

const API = 'https://api.portaldatransparencia.gov.br/api-de-dados'

async function fetchJSON(url: string, token: string, ms = 9000): Promise<{ ok: boolean; status: number; data: unknown }> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { headers: { 'chave-api-dados': token, Accept: 'application/json' }, signal: ctrl.signal })
    let data: unknown = null
    try { data = await res.json() } catch { /* ignore */ }
    return { ok: res.ok, status: res.status, data }
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
    if (!token) {
      return NextResponse.json({ error: 'Chave da API do Portal da Transparência não configurada. Cadastre em Configurações → Configuração IA (gratuita em portaldatransparencia.gov.br/api-de-dados/cadastrar-email).' }, { status: 400 })
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

    for (const prog of monthlyPrograms) {
      let hitMonth: string | null = null
      let valor: string | undefined
      for (const m of months) {
        const r = await fetchJSON(prog.path(m), token)
        if (r.status === 401 || r.status === 403) { authError = true; break }
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
      return NextResponse.json({ error: 'Falha de autenticação na API do Portal da Transparência. Verifique a chave em Configuração IA.' }, { status: 400 })
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
