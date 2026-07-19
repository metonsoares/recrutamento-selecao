import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { portalBridge } from '@/lib/portal-bridge'
import { createPortalClient } from '@/lib/portal-supabase'

/**
 * Heartbeat de presença — chamado pelo PresenceHeartbeat a cada ~45s.
 *
 * O e-mail SEMPRE vem da SESSÃO do usuário logado neste app (nunca do corpo
 * da requisição), o que elimina o spoofing que existia quando o browser
 * chamava `registrar_presenca` direto no Portal com a chave publishable.
 * Encaminha ao Portal pela Edge Function `recrutamento-bridge` (IMPORT_TOKEN);
 * fallback legado server-side até a migration 0067. Best-effort.
 * (O gate de login do proxy.ts já cobre /api/admin/**.)
 */
export async function POST() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const email = user?.email
  if (!email) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const viaBridge = await portalBridge<{ ok: boolean }>('beat', { email })
  if (!viaBridge) {
    // Fallback legado (token ausente/bridge indisponível): RPC direta com a
    // publishable — ainda server-side, com o e-mail da sessão.
    try {
      const portal = createPortalClient()
      await portal.rpc('registrar_presenca', {
        p_email: email,
        p_app_slug: 'recrutamento',
        p_app_name: 'Recrutamento & Seleção',
      })
    } catch {
      /* best-effort */
    }
  }

  return new NextResponse(null, { status: 204 })
}
