import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { UsuariosManager } from './usuarios-manager'

export const dynamic = 'force-dynamic'

export default async function UsuariosPage() {
  const [supabase, service] = await Promise.all([
    createSupabaseServerClient(),
    createSupabaseServiceClient(),
  ])

  const [{ data: { user: currentUser } }, { data: usersData }] = await Promise.all([
    supabase.auth.getUser(),
    service.auth.admin.listUsers({ perPage: 200 }),
  ])

  const users = (usersData?.users ?? []).map(u => ({
    id: u.id,
    email: u.email ?? '',
    name: (u.user_metadata?.full_name as string | undefined) ?? '',
    created_at: u.created_at,
    last_sign_in: u.last_sign_in_at ?? null,
  }))

  return (
    <UsuariosManager
      users={users}
      currentUserId={currentUser?.id ?? ''}
    />
  )
}
