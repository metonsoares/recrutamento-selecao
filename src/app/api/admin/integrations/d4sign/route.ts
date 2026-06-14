import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requireMasterApi } from '@/lib/auth-guard'
import { encryptToken } from '@/lib/helpers'

export const maxDuration = 30

function baseUrl(environment: string): string {
  return environment === 'sandbox'
    ? 'https://sandbox.d4sign.com.br/api/v1'
    : 'https://secure.d4sign.com.br/api/v1'
}

/**
 * POST /api/admin/integrations/d4sign
 * Valida as credenciais (tokenAPI + cryptKey) contra a API da D4Sign e, se
 * válidas, salva criptografadas e marca a integração como conectada.
 * Body: { tokenApi, cryptKey, environment? }
 */
export async function POST(req: NextRequest) {
  try {
    const denied = await requireMasterApi()
    if (denied) return denied

    const { tokenApi, cryptKey, environment } = await req.json()
    const token = String(tokenApi || '').trim()
    const crypt = String(cryptKey || '').trim()
    const env = environment === 'sandbox' ? 'sandbox' : 'producao'

    if (!token || !crypt) {
      return NextResponse.json({ error: 'Informe o Token API e a Crypt Key da D4Sign.' }, { status: 400 })
    }

    // Testa a conexão: lista os cofres (requer tokenAPI + cryptKey válidos)
    const url = `${baseUrl(env)}/cofres?tokenAPI=${encodeURIComponent(token)}&cryptKey=${encodeURIComponent(crypt)}`
    let cofresCount: number | null = null
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 20000)
      const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal })
      clearTimeout(t)
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const msg = (data && (data.mensagem_pt || data.message)) || 'Credenciais inválidas.'
        return NextResponse.json({ error: `D4Sign recusou a conexão: ${msg}` }, { status: 400 })
      }
      cofresCount = Array.isArray(data) ? data.length : null
    } catch {
      return NextResponse.json({ error: 'Não foi possível contatar a D4Sign. Tente novamente.' }, { status: 502 })
    }

    const supabase = await createSupabaseServiceClient()
    const now = new Date().toISOString()
    const payload = {
      provider: 'd4sign',
      environment: env,
      token_api_encrypted: encryptToken(token),
      crypt_key_encrypted: encryptToken(crypt),
      status: 'connected',
      connected_at: now,
      meta: { cofres: cofresCount },
      updated_at: now,
    }
    const { error } = await supabase.from('integrations').upsert(payload, { onConflict: 'provider' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, connected_at: now, environment: env, cofres: cofresCount })
  } catch (err) {
    console.error('[d4sign connect]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/** DELETE — desconecta (limpa credenciais e marca como desconectado). */
export async function DELETE() {
  try {
    const denied = await requireMasterApi()
    if (denied) return denied

    const supabase = await createSupabaseServiceClient()
    const { error } = await supabase.from('integrations').update({
      status: 'disconnected',
      token_api_encrypted: null,
      crypt_key_encrypted: null,
      connected_at: null,
      meta: null,
      updated_at: new Date().toISOString(),
    }).eq('provider', 'd4sign')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[d4sign disconnect]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
