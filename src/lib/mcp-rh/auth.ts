import 'server-only'

/**
 * Autorização da ponte de RH do ChatGPT (/api/mcp/rh).
 *
 * Quem chama é o servidor MCP do Portal (Edge Function bdt-mcp), repassando o
 * MESMO token OAuth que o ChatGPT apresentou a ele. Esta rota NÃO confia no
 * bdt-mcp: refaz a verificação no Portal, que é a fonte da verdade.
 *   1. GET  <Portal>/auth/v1/user       → o token é válido e a sessão existe;
 *   2. RPC  <Portal>/rest/v1/rpc/mcp_contexto (com o mesmo token)
 *      → integração ligada + token emitido para o cliente OAuth cadastrado +
 *        conta na lista de autorizados; devolve os grupos liberados e o
 *        recorte de empresas. Qualquer outra coisa devolve null.
 * Não há segredo compartilhado entre os projetos: a chave do Portal usada
 * aqui é a publishable (pública por design).
 */

const PORTAL_URL = process.env.PORTAL_SUPABASE_URL || 'https://xhqzakikatookphvjewy.supabase.co'
const PORTAL_KEY = process.env.PORTAL_SUPABASE_KEY || 'sb_publishable_5WNUgNJi51Rx3kZIQRtVfA_hVRf1tC9'

export interface ContextoMcp {
  userId: string
  escopos: string[]
  /** ids de `companies` (Recrutamento) liberados; null = todas. */
  empresas: string[] | null
}

async function comTimeout(url: string, init: RequestInit, ms = 10000): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store' })
  } finally { clearTimeout(t) }
}

export async function autorizarMcp(authorization: string | null): Promise<ContextoMcp | null> {
  const token = authorization?.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : ''
  if (!token) return null

  const cab = { apikey: PORTAL_KEY, Authorization: `Bearer ${token}` }

  const u = await comTimeout(`${PORTAL_URL}/auth/v1/user`, { headers: cab }).catch(() => null)
  if (!u || !u.ok) return null
  const usuario = await u.json().catch(() => null) as { id?: string } | null
  if (!usuario?.id) return null

  const r = await comTimeout(`${PORTAL_URL}/rest/v1/rpc/mcp_contexto`, {
    method: 'POST',
    headers: { ...cab, 'Content-Type': 'application/json' },
    body: '{}',
  }).catch(() => null)
  if (!r || !r.ok) return null
  const ctx = await r.json().catch(() => null) as { escopos?: string[]; empresas_rh?: string[] | null } | null
  if (!ctx || !Array.isArray(ctx.escopos)) return null

  return {
    userId: usuario.id,
    escopos: ctx.escopos,
    empresas: Array.isArray(ctx.empresas_rh) && ctx.empresas_rh.length > 0 ? ctx.empresas_rh : null,
  }
}
