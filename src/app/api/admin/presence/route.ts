import { NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { getEffectiveRole } from '@/lib/portal-perfil'

// Janela para considerar um usuário "online agora".
const ONLINE_WINDOW_MS = 2 * 60 * 1000 // 2 minutos

/** Heartbeat: registra que o usuário logado está ativo agora. */
export async function POST() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const service = await createSupabaseServiceClient()
  await service.from('user_presence').upsert(
    { user_id: user.id, email: user.email ?? null, last_seen_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )
  return NextResponse.json({ ok: true })
}

/** Lista de usuários online agora (apenas Master). */
export async function GET() {
  const { user, role } = await getEffectiveRole()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (role !== 'master') return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })

  const service = await createSupabaseServiceClient()
  const since = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString()
  const { data } = await service
    .from('user_presence')
    .select('email, last_seen_at')
    .gte('last_seen_at', since)
    .order('last_seen_at', { ascending: false })

  return NextResponse.json({ online: data ?? [] })
}
