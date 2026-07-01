import { NextResponse } from 'next/server'
import { getEffectiveRole } from '@/lib/portal-perfil'
import { createPortalClient } from '@/lib/portal-supabase'

/**
 * Lista de usuários online agora no app "recrutamento".
 * Fonte única: a presença é gravada no Portal BDT pelo heartbeat
 * (PresenceHeartbeat → registrar_presenca) e lida aqui via a RPC anon-safe
 * `usuarios_online_app`. Apenas Master.
 */
export async function GET() {
  const { user, role } = await getEffectiveRole()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (role !== 'master') return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })

  const portal = createPortalClient()
  const { data } = await portal.rpc('usuarios_online_app', { p_app_slug: 'recrutamento', p_minutos: 3 })
  const online = (Array.isArray(data) ? data : []).map((r: { email: string | null; ultimo: string }) => ({
    email: r.email,
    last_seen_at: r.ultimo,
  }))
  return NextResponse.json({ online })
}
