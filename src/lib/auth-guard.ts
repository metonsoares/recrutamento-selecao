import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { normalizeRole, can, Role, Permission } from '@/lib/permissions'

/** Retorna o perfil do usuário logado (ou redireciona para login). */
export async function getUserRole(): Promise<Role> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return normalizeRole(user.user_metadata?.role as string | undefined)
}

/** Garante que o usuário tenha a permissão; senão redireciona para o /admin. */
export async function requirePermission(perm: Permission): Promise<Role> {
  const role = await getUserRole()
  if (!can(role, perm)) redirect('/admin')
  return role
}
