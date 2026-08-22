import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requireMasterApi } from '@/lib/auth-guard'
import { encryptToken } from '@/lib/helpers'

export const maxDuration = 30

// Integração Control iD / RHiD (ponto em nuvem).
//
// A API do RHiD é o próprio back-end do app (https://rhid.com.br/v2/), em
// serviços .svc — NÃO existe o /api/funcionarios que alguns blogs citam.
//   login:        POST  /v2/login.svc/          { domain, email, password }
//   funcionários: GET   /v2/customerdb/person.svc/...
//   marcações:    GET   /v2/customerdb/afd.svc/...      (AFD — Portaria 671)
//   apuração:     GET   /v2/report.svc/apuracao_ponto
// O token vem em `accessToken` (JWT) e vai como `Authorization: Bearer ...`.
//
// ATENÇÃO: credencial inválida responde HTTP 500 com {code:500, error:"..."},
// e não 401 — por isso o sucesso é decidido pela presença do accessToken.

const RHID_BASE = 'https://rhid.com.br/v2'

interface RespostaLogin {
  code?: number
  error?: string | null
  accessToken?: string | null
  expiredPassword?: boolean
  customerBlocked?: boolean
  revendaInadimplente?: boolean
  listCustomer?: { domain?: string; name?: string }[] | null
}

/** Faz login no RHiD e devolve a resposta crua (não lança em erro de credencial). */
async function loginRhid(domain: string | null, email: string, password: string): Promise<RespostaLogin> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 20000)
  try {
    const res = await fetch(`${RHID_BASE}/login.svc/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ domain: domain || null, email, password }),
      signal: ctrl.signal,
    })
    const texto = await res.text()
    try { return JSON.parse(texto) as RespostaLogin } catch { return { error: 'Resposta inesperada do RHiD.' } }
  } finally { clearTimeout(t) }
}

/** Nome/claims do token, só para exibir na tela. */
function claimsDoToken(jwt: string): Record<string, unknown> {
  try {
    const parte = jwt.split('.')[1]
    return JSON.parse(Buffer.from(parte.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
  } catch { return {} }
}

/**
 * POST — conecta a integração. Body: { domain?, email, password }
 * Se o e-mail pertencer a mais de um domínio, o RHiD devolve `listCustomer`
 * sem token: nesse caso respondemos a lista para o usuário escolher.
 */
export async function POST(req: NextRequest) {
  try {
    const denied = await requireMasterApi()
    if (denied) return denied

    const body = await req.json().catch(() => ({}))
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    const domain = String(body.domain ?? '').trim() || null

    if (!email || !password) {
      return NextResponse.json({ error: 'Informe o e-mail e a senha do RHiD.' }, { status: 400 })
    }

    const r = await loginRhid(domain, email, password)

    // Conta em mais de um domínio: devolve as opções em vez de erro.
    if (!r.accessToken && Array.isArray(r.listCustomer) && r.listCustomer.length > 0) {
      return NextResponse.json({
        precisaDominio: true,
        dominios: r.listCustomer.map(c => ({ domain: c.domain ?? '', nome: c.name ?? c.domain ?? '' })),
      })
    }

    if (!r.accessToken) {
      return NextResponse.json(
        { error: r.error || 'Não foi possível entrar no RHiD com esses dados.' },
        { status: 400 },
      )
    }
    if (r.customerBlocked || r.revendaInadimplente) {
      return NextResponse.json({ error: 'A conta do RHiD está bloqueada. Fale com a Control iD.' }, { status: 400 })
    }

    const claims = claimsDoToken(r.accessToken)
    const supabase = await createSupabaseServiceClient()
    const { error } = await supabase.from('integrations').upsert({
      provider: 'controlid',
      environment: 'producao',
      account_email: email,
      // a senha é o que permite renovar o token; guardada criptografada
      token_api_encrypted: encryptToken(password),
      status: 'connected',
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      meta: {
        domain,
        base_url: RHID_BASE,
        cliente: claims.nomeCliente ?? claims.customerName ?? null,
        expira_senha: r.expiredPassword === true,
      },
    }, { onConflict: 'provider' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      domain,
      cliente: claims.nomeCliente ?? claims.customerName ?? null,
      aviso: r.expiredPassword ? 'A senha do RHiD está expirada — troque-a no RHiD para a integração não parar.' : null,
    })
  } catch (err) {
    console.error('[controlid POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/** DELETE — desconecta e apaga a credencial guardada. */
export async function DELETE() {
  try {
    const denied = await requireMasterApi()
    if (denied) return denied

    const supabase = await createSupabaseServiceClient()
    const { error } = await supabase.from('integrations')
      .update({
        status: 'disconnected',
        token_api_encrypted: null,
        connected_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('provider', 'controlid')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[controlid DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
