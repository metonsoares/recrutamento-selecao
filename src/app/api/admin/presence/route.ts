import { NextResponse } from 'next/server'
import { getEffectiveRole } from '@/lib/portal-perfil'
import { portalBridge } from '@/lib/portal-bridge'
import { createPortalClient } from '@/lib/portal-supabase'

type OnlineRow = { email: string | null; ultimo: string }

/**
 * Lista de usuários online agora no app "recrutamento". Apenas Master.
 * Fonte única: a presença é gravada no Portal BDT pelo heartbeat
 * (PresenceHeartbeat → /api/admin/presence-beat → registrar_presenca).
 * Leitura pela Edge Function `recrutamento-bridge` (IMPORT_TOKEN); o fallback
 * legado (RPC direta com a publishable) morre com a migration 0067 do Portal.
 */
export async function GET() {
  const { user, role } = await getEffectiveRole()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (role !== 'master') return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })

  // Caminho seguro (bridge autenticada por IMPORT_TOKEN).
  const viaBridge = await portalBridge<{ online: OnlineRow[] }>('online', { minutos: 3 })
  let rows: OnlineRow[] | null = viaBridge ? (viaBridge.online ?? []) : null

  // Fallback legado (token ausente/bridge indisponível).
  if (rows === null) {
    const portal = createPortalClient()
    const { data } = await portal.rpc('usuarios_online_app', { p_app_slug: 'recrutamento', p_minutos: 3 })
    rows = Array.isArray(data) ? (data as OnlineRow[]) : []
  }

  const online = rows.map((r) => ({ email: r.email, last_seen_at: r.ultimo }))
  return NextResponse.json({ online })
}
