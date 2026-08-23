import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { decryptToken } from '@/lib/helpers'

export const maxDuration = 60

/**
 * Recebe as passagens extraídas da WE Benefícios.
 *
 * Por que esta rota existe fora de /api/admin: quem chama é um atalho que roda
 * DENTRO do navegador do usuário, na aba da WE — é o único lugar onde o cookie
 * de sessão dela (HttpOnly) é enviado automaticamente. Como a chamada vem de
 * outra origem, o cookie do nosso app não acompanha, então a autenticação é um
 * token pessoal no header Authorization.
 *
 * O login da WE é protegido por reCAPTCHA, então não existe login
 * servidor-a-servidor: enquanto eles não liberarem API de parceiro, este é o
 * caminho honesto.
 */

const ORIGEM_WE = 'https://app.webeneficios.com'

function cabecalhosCors(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': ORIGEM_WE,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cabecalhosCors() })
}

interface LinhaWe {
  cpf?: string
  nome?: string | null
  dias?: unknown
  valor?: unknown
  pedido?: string | null
  /** yyyy-mm-01 — mês de USO, que o próprio recibo da WE informa. */
  competencia?: string
}

function digitos11(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '').padStart(11, '0').slice(-11)
}

function inteiro(v: unknown, max: number): number {
  const n = Math.trunc(Number(v))
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0
}

function dinheiro(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0
}

export async function POST(req: NextRequest) {
  const cors = cabecalhosCors()
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
    if (!token) {
      return NextResponse.json({ error: 'Token ausente.' }, { status: 401, headers: cors })
    }

    const supabase = await createSupabaseServiceClient()
    const { data: integracao } = await supabase
      .from('integrations')
      .select('token_api_encrypted, status, account_email')
      .eq('provider', 'webeneficios')
      .maybeSingle()

    if (!integracao?.token_api_encrypted || integracao.status !== 'connected') {
      return NextResponse.json(
        { error: 'A integração WE não está ativa. Gere o atalho de novo no portal.' },
        { status: 403, headers: cors },
      )
    }
    if (decryptToken(integracao.token_api_encrypted as string) !== token) {
      return NextResponse.json({ error: 'Token inválido.' }, { status: 403, headers: cors })
    }

    const body = await req.json().catch(() => ({}))
    const entrada = (Array.isArray(body.linhas) ? body.linhas : []) as LinhaWe[]
    if (entrada.length === 0) {
      return NextResponse.json({ error: 'Nada para gravar.' }, { status: 400, headers: cors })
    }

    // Uma pessoa pode ter mais de uma linha por recibo (operadoras diferentes):
    // dias é o maior (é o período), valor soma.
    const acumulado = new Map<string, { competencia: string; cpf: string; nome: string | null; dias: number; valor: number; pedido: string | null }>()
    const competencias = new Set<string>()

    for (const l of entrada) {
      const competencia = String(l.competencia ?? '')
      if (!/^\d{4}-\d{2}-01$/.test(competencia)) continue
      const cpf = digitos11(l.cpf)
      if (cpf.length !== 11 || Number(cpf) === 0) continue

      competencias.add(competencia)
      const chave = `${competencia}|${cpf}`
      const atual = acumulado.get(chave)
        ?? { competencia, cpf, nome: null, dias: 0, valor: 0, pedido: null }
      atual.dias = Math.max(atual.dias, inteiro(l.dias, 31))
      atual.valor = Math.round((atual.valor + dinheiro(l.valor)) * 100) / 100
      atual.nome = atual.nome ?? (String(l.nome ?? '').trim() || null)
      atual.pedido = atual.pedido ?? (String(l.pedido ?? '').trim() || null)
      acumulado.set(chave, atual)
    }

    if (acumulado.size === 0) {
      return NextResponse.json(
        { error: 'Nenhuma linha válida (CPF ou competência fora do formato).' },
        { status: 400, headers: cors },
      )
    }

    // Casa com os nossos colaboradores pelo CPF — a WE não conhece o nosso id.
    const { data: cands } = await supabase
      .from('candidates').select('id, full_name, cpf').is('deleted_at', null)
    const porCpf = new Map<string, { id: string; nome: string }>()
    for (const c of cands ?? []) {
      const cpf = digitos11(c.cpf)
      if (cpf.length === 11 && !porCpf.has(cpf)) {
        porCpf.set(cpf, { id: c.id as string, nome: c.full_name as string })
      }
    }

    const linhas = Array.from(acumulado.values()).map(p => {
      const casado = porCpf.get(p.cpf)
      return {
        competencia: p.competencia,
        candidate_id: casado?.id ?? null,
        cpf: p.cpf,
        nome: casado?.nome ?? p.nome,
        dias: p.dias,
        quantidade: 0,
        valor: p.valor,
        pedido: p.pedido,
        importado_por: (integracao.account_email as string) ?? 'atalho-we',
        importado_em: new Date().toISOString(),
      }
    })

    // Reimportar SOBRESCREVE: a chave é (competência, CPF).
    const { error } = await supabase
      .from('vt_passagens').upsert(linhas, { onConflict: 'competencia,cpf' })
    if (error) return NextResponse.json({ error: error.message }, { status: 400, headers: cors })

    const casados = linhas.filter(l => l.candidate_id).length
    return NextResponse.json({
      ok: true,
      gravados: linhas.length,
      casados,
      nao_encontrados: linhas.filter(l => !l.candidate_id).map(l => l.nome || l.cpf).slice(0, 30),
      competencias: Array.from(competencias).sort(),
    }, { headers: cors })
  } catch (err) {
    console.error('[we-passagens POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500, headers: cabecalhosCors() })
  }
}
