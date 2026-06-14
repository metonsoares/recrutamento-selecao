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

    const { tokenApi, cryptKey, environment, accountEmail } = await req.json()
    const token = String(tokenApi || '').trim()
    const crypt = String(cryptKey || '').trim() // opcional — só se habilitado na conta
    const accEmail = String(accountEmail || '').trim().toLowerCase()
    const env = environment === 'sandbox' ? 'sandbox' : 'producao'

    if (!token) {
      return NextResponse.json({ error: 'Informe o Token API da D4Sign.' }, { status: 400 })
    }

    // Testa a conexão: lista os cofres (endpoint oficial é /safes, não /cofres).
    // cryptKey só é enviada se informada (a D4Sign exige apenas quando habilitada).
    const url = `${baseUrl(env)}/safes?tokenAPI=${encodeURIComponent(token)}`
      + (crypt ? `&cryptKey=${encodeURIComponent(crypt)}` : '')
    let cofresCount: number | null = null
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 20000)
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          // o SDK oficial envia o tokenAPI também no header (além da query)
          tokenAPI: token,
          'User-Agent': 'Mozilla/5.0 (compatible; BrowniePesquisa/1.0)',
        },
        signal: ctrl.signal,
      })
      clearTimeout(t)
      const rawText = await res.text()
      let data: unknown = null
      try { data = JSON.parse(rawText) } catch { /* resposta não-JSON */ }

      if (!res.ok) {
        const d = data as Record<string, unknown> | null
        const apiMsg = (d?.mensagem_pt as string) || (d?.message as string)
        const snippet = rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
        const detail = apiMsg || snippet || 'sem detalhe'
        // Dica de causa comum: token não corresponde ao ambiente selecionado
        const hint = res.status === 401
          ? ` Verifique se o Token API é do ambiente "${env === 'sandbox' ? 'Sandbox' : 'Produção'}" (tokens de produção não funcionam no sandbox e vice-versa) e se foi copiado por inteiro, sem espaços.`
          : ''
        return NextResponse.json({ error: `D4Sign recusou a conexão (HTTP ${res.status}): ${detail}.${hint}` }, { status: 400 })
      }
      cofresCount = Array.isArray(data) ? (data as unknown[]).length : null
    } catch {
      return NextResponse.json({ error: 'Não foi possível contatar a D4Sign (tempo esgotado ou rede). Tente novamente.' }, { status: 502 })
    }

    const supabase = await createSupabaseServiceClient()
    const now = new Date().toISOString()
    const payload = {
      provider: 'd4sign',
      environment: env,
      token_api_encrypted: encryptToken(token),
      crypt_key_encrypted: crypt ? encryptToken(crypt) : null,
      account_email: accEmail || null,
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

/** PUT — atualiza apenas o e-mail de cadastro na D4Sign (assinante da empresa). */
export async function PUT(req: NextRequest) {
  try {
    const denied = await requireMasterApi()
    if (denied) return denied

    const { accountEmail } = await req.json()
    const email = String(accountEmail || '').trim().toLowerCase()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 })
    }

    const supabase = await createSupabaseServiceClient()
    const { error } = await supabase.from('integrations')
      .update({ account_email: email || null, updated_at: new Date().toISOString() })
      .eq('provider', 'd4sign')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, account_email: email || null })
  } catch (err) {
    console.error('[d4sign update email]', err)
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
