import { NextRequest, NextResponse } from 'next/server'
import { autorizarMcp } from '@/lib/mcp-rh/auth'
import { ErroMcp, OPERACOES } from '@/lib/mcp-rh/ops'
import { ErroRhid } from '@/lib/rhid'

// Ponte de RH do ChatGPT — SOMENTE LEITURA.
//
// Quem chama: o servidor MCP do Portal (Edge Function bdt-mcp), repassando o
// token OAuth do ChatGPT. Fora do proxy.ts de propósito (o matcher só cobre
// /admin e /api/admin): esta rota não usa cookie de sessão — a autorização é
// o token, conferido de novo no Portal a cada chamada (lib/mcp-rh/auth.ts).
//
// Body: { op: '<operação>', args: {...} }. Só operações da lista fixa
// OPERACOES; cada uma exige seus grupos (rh_read, ponto_read, ...).
// Erros nunca devolvem detalhe interno nem dado de outra pessoa.

export const maxDuration = 120
export const dynamic = 'force-dynamic'

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const ctx = await autorizarMcp(req.headers.get('authorization'))
  if (!ctx) return json({ error: 'nao_autorizado' }, 401)

  const body = await req.json().catch(() => null) as { op?: unknown; args?: unknown } | null
  const op = typeof body?.op === 'string' ? body.op : ''
  const operacao = Object.prototype.hasOwnProperty.call(OPERACOES, op) ? OPERACOES[op] : undefined
  if (!operacao) return json({ error: 'operacao_inexistente' }, 400)

  const faltando = operacao.escopos.filter(e => !ctx.escopos.includes(e))
  if (faltando.length) return json({ error: 'sem_permissao', grupos_necessarios: faltando }, 403)

  const args = body?.args && typeof body.args === 'object' && !Array.isArray(body.args)
    ? body.args as Record<string, unknown>
    : {}

  try {
    const r = await operacao.executar(args, ctx)
    return json(r)
  } catch (e) {
    if (e instanceof ErroMcp || e instanceof ErroRhid) {
      return json({ error: 'consulta', mensagem: e.message }, e.status >= 400 && e.status < 600 ? e.status : 400)
    }
    console.error(`[mcp-rh] ${op}:`, e instanceof Error ? e.message : e)
    return json({ error: 'interno', mensagem: 'Falha interna ao consultar o RH.' }, 500)
  }
}
