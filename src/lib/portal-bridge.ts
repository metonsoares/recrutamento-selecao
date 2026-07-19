// Ponte server-side segura para o Portal BDT via Edge Function
// `recrutamento-bridge` (autenticada pelo secret IMPORT_TOKEN — o mesmo
// mecanismo cross-project de gerar-magiclink/candidatos-export).
//
// Uso EXCLUSIVAMENTE no servidor (rotas /api e código server-side): o
// IMPORT_TOKEN nunca chega ao browser.
//
// Comportamento de transição: se `IMPORT_TOKEN` não estiver no env (Vercel)
// ou a bridge falhar, retorna null e o CHAMADOR cai no caminho legado (RPC
// direta com a chave publishable). Esse legado morre quando a migration 0067
// do Portal revogar `anon` das RPCs — a partir daí a bridge é o único caminho.

const PORTAL_URL =
  process.env.PORTAL_SUPABASE_URL || 'https://xhqzakikatookphvjewy.supabase.co'
const PORTAL_PUBLISHABLE_KEY =
  process.env.PORTAL_SUPABASE_KEY || 'sb_publishable_5WNUgNJi51Rx3kZIQRtVfA_hVRf1tC9'

type AcaoBridge = 'perfil' | 'online' | 'beat'

/**
 * Chama a Edge Function `recrutamento-bridge` do Portal.
 * Retorna o JSON da resposta, ou null se o token não está configurado,
 * a resposta não é 2xx ou a rede falhou (best-effort — chamador decide o fallback).
 */
export async function portalBridge<T>(
  acao: AcaoBridge,
  payload: Record<string, unknown> = {},
): Promise<T | null> {
  const token = process.env.IMPORT_TOKEN
  if (!token) return null
  try {
    const res = await fetch(`${PORTAL_URL}/functions/v1/recrutamento-bridge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-import-token': token,
        // apikey pública do Portal: exigida pelo gateway de Functions em
        // algumas configurações; não é a credencial (a credencial é o token).
        apikey: PORTAL_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ acao, ...payload }),
      cache: 'no-store',
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}
