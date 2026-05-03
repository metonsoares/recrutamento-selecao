// Rate limiter baseado em memória (por instância serverless).
// Para múltiplas instâncias simultâneas em produção, substituir por
// Upstash Redis (https://upstash.com) — plano gratuito suficiente.

interface Window {
  timestamps: number[]
}

const store = new Map<string, Window>()

// Remove entradas expiradas periodicamente para não vazar memória
let lastCleanup = Date.now()
function maybeCleanup(windowMs: number) {
  const now = Date.now()
  if (now - lastCleanup < 60_000) return
  lastCleanup = now
  for (const [key, win] of store.entries()) {
    if (win.timestamps.every((t) => now - t > windowMs)) store.delete(key)
  }
}

export function isRateLimited(
  ip: string,
  limit: number,
  windowMs: number
): boolean {
  maybeCleanup(windowMs)
  const now = Date.now()
  const win = store.get(ip) ?? { timestamps: [] }
  win.timestamps = win.timestamps.filter((t) => now - t < windowMs)

  if (win.timestamps.length >= limit) {
    store.set(ip, win)
    return true
  }

  win.timestamps.push(now)
  store.set(ip, win)
  return false
}

export function getClientIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    headers.get('x-real-ip') ??
    '127.0.0.1'
  )
}
