'use client'
import { useEffect } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { createPortalClient } from '@/lib/portal-supabase'

/**
 * Heartbeat de presença no PORTAL BDT.
 *
 * Enquanto houver usuário logado, a cada ~45s chama a RPC pública
 * `registrar_presenca` no Supabase do Portal (via `createPortalClient()`, NÃO o
 * Supabase próprio do app) para que o dashboard master do Portal mostre o usuário
 * como online no app "recrutamento". O e-mail vem do client de auth do próprio app.
 *
 * Best-effort: erros são ignorados. Renderiza nada.
 */
export function PresenceHeartbeat() {
  useEffect(() => {
    let alive = true
    let email: string | null = null

    const beat = () => {
      if (!alive || !email) return
      if (document.visibilityState !== 'visible') return
      void (createPortalClient() as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown>
      })
        .rpc('registrar_presenca', {
          p_email: email,
          p_app_slug: 'recrutamento',
          p_app_name: 'Recrutamento & Seleção',
        })
        .catch(() => {})
    }

    const supabase = createSupabaseBrowserClient()

    // E-mail inicial + primeiro ping.
    supabase.auth.getUser().then(({ data }) => {
      if (!alive) return
      email = data.user?.email ?? null
      beat()
    })

    // Acompanha mudanças de sessão (login/logout/refresh).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      email = session?.user?.email ?? null
      beat()
    })

    const id = setInterval(beat, 45_000) // a cada ~45s
    const onVis = () => { if (document.visibilityState === 'visible') beat() }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      alive = false
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
      sub.subscription.unsubscribe()
    }
  }, [])

  return null
}
