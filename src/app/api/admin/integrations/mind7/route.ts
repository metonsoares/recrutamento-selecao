import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requireMasterApi } from '@/lib/auth-guard'
import { encryptToken } from '@/lib/helpers'

export const maxDuration = 30

/**
 * Integração Mind7 — painel de consultas (CPF, Big Data, vínculos de emprego).
 *
 * O Mind7 não publica API: o acesso é o próprio painel web, e o site inteiro
 * fica atrás do desafio anti-robô da Cloudflare. Um login feito daqui (servidor
 * da Vercel) responde 403 "Just a moment…" — não é senha errada, é o site
 * recusando requisição que não vem de navegador, e passar por isso seria
 * derrotar a proteção dele.
 *
 * Então a credencial é guardada (criptografada, como a do RHiD) e o alcance da
 * integração é medido na hora de conectar:
 *   - 'servidor'  → o painel respondeu; dá para consultar direto daqui.
 *   - 'navegador' → veio o desafio; a consulta acontece no navegador de quem
 *                   está logado, e a credencial serve para preencher o login.
 */

const MIND7_BASE = 'https://www.mind-7.org'
const NAVEGADOR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

type Alcance = 'servidor' | 'navegador'

/** O painel aceita requisição de servidor ou devolve o desafio da Cloudflare? */
async function medirAlcance(): Promise<{ alcance: Alcance; detalhe: string }> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 15000)
  try {
    const res = await fetch(`${MIND7_BASE}/painel/`, {
      headers: { 'User-Agent': NAVEGADOR, Accept: 'text/html' },
      redirect: 'follow',
      signal: ctrl.signal,
    })
    const corpo = (await res.text()).slice(0, 4000)
    const desafio = res.status === 403
      || /just a moment|challenges\.cloudflare|cf-chl|turnstile/i.test(corpo)

    return desafio
      ? { alcance: 'navegador', detalhe: `o painel respondeu ${res.status} com o desafio da Cloudflare` }
      : { alcance: 'servidor', detalhe: `o painel respondeu ${res.status}` }
  } catch (e) {
    return { alcance: 'navegador', detalhe: `não consegui alcançar o painel (${(e as Error).name})` }
  } finally { clearTimeout(t) }
}

/** POST — guarda a credencial e mede por onde a consulta vai poder passar. */
export async function POST(req: NextRequest) {
  try {
    const denied = await requireMasterApi()
    if (denied) return denied

    const body = await req.json().catch(() => ({}))
    const usuario = String(body.usuario ?? '').trim()
    const senha = String(body.senha ?? '')

    if (!usuario || !senha) {
      return NextResponse.json({ error: 'Informe o usuário e a senha do Mind7.' }, { status: 400 })
    }

    const { alcance, detalhe } = await medirAlcance()

    const supabase = await createSupabaseServiceClient()
    const { error } = await supabase.from('integrations').upsert({
      provider: 'mind7',
      environment: 'producao',
      account_email: usuario,
      // Criptografada, como a do RHiD: nunca volta para a tela.
      token_api_encrypted: encryptToken(senha),
      status: 'connected',
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      meta: {
        base_url: MIND7_BASE,
        url_consulta: `${MIND7_BASE}/painel/consultas/cpf/`,
        alcance,
        alcance_detalhe: detalhe,
        medido_em: new Date().toISOString(),
      },
    }, { onConflict: 'provider' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      alcance,
      aviso: alcance === 'navegador'
        ? `Credencial guardada, mas ${detalhe}. A consulta vai precisar sair do seu navegador, `
          + 'logado no Mind7 — o login automático a partir do servidor não passa pela Cloudflare.'
        : null,
    })
  } catch (err) {
    console.error('[mind7 POST]', err)
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
      .eq('provider', 'mind7')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[mind7 DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
