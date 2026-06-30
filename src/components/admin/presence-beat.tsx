'use client'
import { useEffect } from 'react'

/**
 * Heartbeat de presença: enquanto o painel admin estiver aberto, pinga o
 * servidor periodicamente para marcar o usuário como "online agora".
 * Renderiza nada. Montado no layout do admin (vale para todos os perfis com painel).
 */
export function PresenceBeat() {
  useEffect(() => {
    let alive = true
    const ping = () => {
      if (alive && document.visibilityState !== 'hidden') {
        fetch('/api/admin/presence', { method: 'POST' }).catch(() => {})
      }
    }
    ping()
    const id = setInterval(ping, 60_000) // a cada 60s
    const onVis = () => { if (document.visibilityState === 'visible') ping() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])
  return null
}
