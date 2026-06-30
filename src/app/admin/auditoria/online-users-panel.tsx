'use client'
import { useEffect, useState } from 'react'
import { Circle } from 'lucide-react'

export interface OnlineUser { email: string | null; last_seen_at: string }

/** Busca e mantém atualizada (a cada 30s) a lista de usuários online agora. */
export function useOnlineUsers(): OnlineUser[] | null {
  const [online, setOnline] = useState<OnlineUser[] | null>(null)
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch('/api/admin/presence', { cache: 'no-store' })
        const d = await res.json()
        if (alive) setOnline(Array.isArray(d.online) ? d.online : [])
      } catch { /* ignora */ }
    }
    load()
    const id = setInterval(load, 30_000)
    return () => { alive = false; clearInterval(id) }
  }, [])
  return online
}

function relTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 45) return 'agora há pouco'
  const m = Math.floor(s / 60)
  return m <= 1 ? 'há 1 min' : `há ${m} min`
}

/** Painel "Logados agora" — recebe a lista (do hook useOnlineUsers). */
export function OnlineUsersPanel({ online }: { online: OnlineUser[] | null }) {
  const count = online?.length ?? 0

  return (
    <div className="bg-white rounded-xl border shadow-sm p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          Logados agora
        </h2>
        <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">
          {count} online
        </span>
      </div>

      {online === null ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : count === 0 ? (
        <p className="text-sm text-muted-foreground">Ninguém logado no momento.</p>
      ) : (
        <ul className="space-y-2">
          {online.map((u, i) => (
            <li key={(u.email ?? '') + i} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 min-w-0">
                <Circle className="w-2 h-2 fill-emerald-500 text-emerald-500 shrink-0" />
                <span className="truncate text-gray-800">{u.email || '—'}</span>
              </span>
              <span className="text-[11px] text-muted-foreground shrink-0">ativo {relTime(u.last_seen_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
