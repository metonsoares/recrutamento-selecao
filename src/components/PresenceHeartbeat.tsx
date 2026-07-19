'use client'
import { useEffect } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

/**
 * Heartbeat de presença no PORTAL BDT.
 *
 * Enquanto houver usuário logado, a cada ~45s chama a rota interna
 * `/api/admin/presence-beat`, que resolve o e-mail DA SESSÃO no servidor e
 * repassa ao Portal pela Edge Function `recrutamento-bridge` (IMPORT_TOKEN).
 * O browser não fala mais direto com o Supabase do Portal — isso eliminou o
 * spoofing de presença (o e-mail vinha do cliente) e permitiu revogar `anon`
 * da RPC `registrar_presenca` (migration 0067 do Portal).
 *
 * Best-effort: erros são ignorados. Renderiza nada.
 */
export function PresenceHeartbeat() {
  useEffect(() => {
    let alive = true
    let logged = false

    const beat = () => {
      if (!alive || !logged) return
      if (document.visibilityState !== 'visible') return
      void fetch('/api/admin/presence-beat', { method: 'POST' }).catch(() => {})
    }

    const supabase = createSupabaseBrowserClient()

    // Estado inicial + primeiro ping.
    supabase.auth.getUser().then(({ data }) => {
      if (!alive) return
      logged = !!data.user
      beat()
    })

    // Acompanha mudanças de sessão (login/logout/refresh).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      logged = !!session?.user
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
