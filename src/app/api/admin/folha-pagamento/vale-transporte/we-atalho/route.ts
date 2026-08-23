import { NextResponse } from 'next/server'
import { createSupabaseServiceClient, createSupabaseServerClient } from '@/lib/supabase-server'
import { requireAnyRoleApi } from '@/lib/auth-guard'
import { encryptToken } from '@/lib/helpers'
import { gerarAtalhoWe } from '@/lib/we-atalho'
import crypto from 'crypto'

/**
 * Gera (ou regenera) o atalho que puxa as passagens da WE.
 *
 * O token vive criptografado em `integrations` (provider 'webeneficios') e vai
 * embutido no atalho. Gerar de novo INVALIDA o anterior — é assim que se
 * revoga um atalho que vazou.
 */
export async function POST() {
  try {
    const denied = await requireAnyRoleApi(['master', 'gestor_rh'])
    if (denied) return denied

    const auth = await createSupabaseServerClient()
    const { data: { user } } = await auth.auth.getUser()

    const token = crypto.randomBytes(32).toString('base64url')
    const supabase = await createSupabaseServiceClient()

    const { error } = await supabase.from('integrations').upsert({
      provider: 'webeneficios',
      environment: 'producao',
      account_email: user?.email ?? null,
      token_api_encrypted: encryptToken(token),
      status: 'connected',
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      meta: { origem: 'atalho-navegador', motivo: 'WE não tem API pública; login com reCAPTCHA' },
    }, { onConflict: 'provider' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const base = process.env.NEXT_PUBLIC_APP_URL
      || process.env.NEXT_PUBLIC_SITE_URL
      || 'https://recrutamento-selecao-ashen.vercel.app'

    return NextResponse.json({
      ok: true,
      atalho: gerarAtalhoWe(`${base}/api/integracoes/we-passagens`, token),
    })
  } catch (err) {
    console.error('[we-atalho POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
