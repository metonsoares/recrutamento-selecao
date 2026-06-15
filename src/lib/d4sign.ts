import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { decryptToken } from '@/lib/helpers'

/**
 * Cliente da API da D4Sign (assinatura eletrônica).
 * Autenticação por tokenAPI + cryptKey (query string), conforme SDK oficial
 * (d4sign/d4sign-php). Endpoints: /safes, /documents/.../uploadbinary,
 * /createlist, /sendtosigner, /download. Base: api/v1.
 */

export interface D4SignCreds { token: string; crypt: string; base: string; accountEmail: string }

export async function getD4SignCreds(): Promise<D4SignCreds | null> {
  const supabase = await createSupabaseServiceClient()
  const { data } = await supabase
    .from('integrations')
    .select('environment, status, token_api_encrypted, crypt_key_encrypted, account_email')
    .eq('provider', 'd4sign').maybeSingle()
  if (!data || data.status !== 'connected' || !data.token_api_encrypted) return null
  let token = '', crypt = ''
  try { token = decryptToken(data.token_api_encrypted as string) } catch { return null }
  try { crypt = data.crypt_key_encrypted ? decryptToken(data.crypt_key_encrypted as string) : '' } catch { crypt = '' }
  const base = data.environment === 'sandbox'
    ? 'https://sandbox.d4sign.com.br/api/v1'
    : 'https://secure.d4sign.com.br/api/v1'
  return { token, crypt, base, accountEmail: (data.account_email as string | null) || '' }
}

function authQuery(c: D4SignCreds): string {
  return `tokenAPI=${encodeURIComponent(c.token)}` + (c.crypt ? `&cryptKey=${encodeURIComponent(c.crypt)}` : '')
}

/** Requisição genérica. POST envia form-urlencoded (valores já json-encoded quando o SDK assim faz). */
async function call(c: D4SignCreds, path: string, method: 'GET' | 'POST', fields?: Record<string, string>): Promise<{ ok: boolean; status: number; data: unknown; raw: string }> {
  const url = `${c.base}${path}?${authQuery(c)}`
  const init: RequestInit = {
    method,
    headers: {
      Accept: 'application/json',
      tokenAPI: c.token,
      'User-Agent': 'Mozilla/5.0 (compatible; BrowniePesquisa/1.0)',
    },
  }
  if (method === 'POST') {
    const body = new URLSearchParams()
    for (const [k, v] of Object.entries(fields || {})) body.append(k, v)
    init.body = body
    ;(init.headers as Record<string, string>)['Content-Type'] = 'application/x-www-form-urlencoded'
  }
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 40000)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    const raw = await res.text()
    let data: unknown = null
    try { data = JSON.parse(raw) } catch { /* não-JSON */ }
    return { ok: res.ok, status: res.status, data, raw }
  } finally { clearTimeout(t) }
}

export function d4signError(r: { status: number; data: unknown; raw: string }): string {
  const d = r.data as Record<string, unknown> | null
  const msg = (d?.mensagem_pt as string) || (d?.message as string) || (d?.error as string)
  const snippet = r.raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
  return `${msg || snippet || 'erro desconhecido'} (HTTP ${r.status})`
}

/** Lista os cofres. Retorna o array (ou null em erro). */
export async function listSafes(c: D4SignCreds): Promise<Array<Record<string, unknown>> | null> {
  const r = await call(c, '/safes', 'GET')
  if (!r.ok || !Array.isArray(r.data)) return null
  return r.data as Array<Record<string, unknown>>
}

/** Faz upload de um documento (base64) para um cofre. Retorna o uuid do documento. */
export async function uploadBinary(c: D4SignCreds, safeUuid: string, base64: string, mime: string, name: string) {
  const r = await call(c, `/documents/${safeUuid}/uploadbinary`, 'POST', {
    base64_binary_file: base64,
    mime_type: mime,
    name,
    uuid_folder: JSON.stringify(''),
  })
  const d = r.data as Record<string, unknown> | null
  const uuid = (d?.uuid as string) || null
  return { ok: r.ok && !!uuid, uuid, error: r.ok ? '' : d4signError(r) }
}

export interface D4Signer { email: string; act?: string; foreign?: string; methodauth?: string }

/** Cadastra a lista de signatários do documento (ordem = ordem do array). */
export async function createSignerList(c: D4SignCreds, docUuid: string, signers: D4Signer[]) {
  const payload = signers.map(s => ({
    email: s.email,
    act: s.act || '1', // 1 = assinar
    foreign: s.foreign || '0',
    certificadoicpbr: '0',
    assinatura_presencial: '0',
    docauth: '0',
    docauthandselfie: '0',
    embed_methodauth: s.methodauth || 'email',
    embed_smsnumber: '',
    upload_allow: '0',
    upload_obs: '0',
  }))
  const r = await call(c, `/documents/${docUuid}/createlist`, 'POST', { signers: JSON.stringify(payload) })
  return { ok: r.ok, error: r.ok ? '' : d4signError(r) }
}

/** Envia o documento para assinatura. workflow='0' = sem ordem (todos podem assinar); '1' = ordem dos signatários. */
export async function sendToSigner(c: D4SignCreds, docUuid: string, message = '', workflow = '0') {
  const r = await call(c, `/documents/${docUuid}/sendtosigner`, 'POST', {
    message: JSON.stringify(message),
    workflow: JSON.stringify(workflow),
    skip_email: JSON.stringify(false),
  })
  return { ok: r.ok, error: r.ok ? '' : d4signError(r) }
}

/** Registra um webhook (POSTBack) para o documento — D4Sign avisa quando o status muda. */
export async function webhookAdd(c: D4SignCreds, docUuid: string, url: string) {
  const r = await call(c, `/documents/${docUuid}/webhooks`, 'POST', { url: JSON.stringify(url) })
  return { ok: r.ok, error: r.ok ? '' : d4signError(r) }
}

/** Consulta o documento; retorna o statusName/statusId crus. */
export async function getDocument(c: D4SignCreds, docUuid: string) {
  const r = await call(c, `/documents/${docUuid}`, 'GET')
  // a resposta costuma ser um array com 1 item, ou { ... }
  let doc: Record<string, unknown> | null = null
  if (Array.isArray(r.data)) doc = (r.data[0] as Record<string, unknown>) || null
  else if (r.data && typeof r.data === 'object') doc = r.data as Record<string, unknown>
  return { ok: r.ok && !!doc, doc, error: r.ok ? '' : d4signError(r) }
}

/** Documento finalizado/assinado? (heurística sobre statusId/statusName). */
export function isSigned(doc: Record<string, unknown> | null): boolean {
  if (!doc) return false
  const id = String(doc.statusId ?? doc.status ?? '')
  const name = String(doc.statusName ?? doc.status_name ?? '').toLowerCase()
  // statusId 4 = Finalizado na D4Sign; também aceita nomes equivalentes
  if (id === '4') return true
  return /finaliz|assinad|conclu/.test(name)
}

/** URL do arquivo (assinado) para download. type 'PDF'. */
export async function getSignedFileUrl(c: D4SignCreds, docUuid: string): Promise<string | null> {
  const r = await call(c, `/documents/${docUuid}/download`, 'POST', { type: JSON.stringify('PDF') })
  const d = r.data as Record<string, unknown> | null
  return (d?.url as string) || null
}
