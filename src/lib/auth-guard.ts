import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { normalizeRole, Role, Permission } from '@/lib/permissions'
import { getGrantedPerms } from '@/lib/permissions-server'

/** Retorna o perfil do usuário logado (ou redireciona para login). */
export async function getUserRole(): Promise<Role> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return normalizeRole(user.user_metadata?.role as string | undefined)
}

/** Garante que o usuário tenha a permissão (conforme banco); senão redireciona. */
export async function requirePermission(perm: Permission): Promise<Role> {
  const role = await getUserRole()
  const granted = await getGrantedPerms(role)
  if (!granted.has(perm)) redirect('/admin')
  return role
}

/** Garante que o usuário é master; senão redireciona. */
export async function requireMaster(): Promise<Role> {
  const role = await getUserRole()
  if (role !== 'master') redirect('/admin')
  return role
}
