import { requireMaster } from '@/lib/auth-guard'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { normalizeRole } from '@/lib/permissions'
import { getAllLevels } from '@/lib/permissions-server'
import { UsuariosManager } from './usuarios-manager'
import { AccessMatrix } from './access-matrix'

export const dynamic = 'force-dynamic'

export default async function UsuariosPage() {
  await requireMaster()
  const [supabase, service] = await Promise.all([
    createSupabaseServerClient(),
    createSupabaseServiceClient(),
  ])

  const [{ data: { user: currentUser } }, { data: usersData }, levels] = await Promise.all([
    supabase.auth.getUser(),
    service.auth.admin.listUsers({ perPage: 200 }),
    getAllLevels(),
  ])

  const users = (usersData?.users ?? [])
    // Exclui os usuários criados em "Cadastrar Usuários" (identificados pelo code);
    // esta tela lista apenas usuários administrativos do painel.
    .filter(u => !(u.user_metadata?.code as string | undefined))
    .map(u => ({
      id: u.id,
      email: u.email ?? '',
      name: (u.user_metadata?.full_name as string | undefined) ?? '',
      role: normalizeRole((u.user_metadata?.perfil ?? u.user_metadata?.role) as string | undefined),
      created_at: u.created_at,
      last_sign_in: u.last_sign_in_at ?? null,
    }))

  return (
    <>
      <UsuariosManager
        users={users}
        currentUserId={currentUser?.id ?? ''}
      />
      <div className="px-4 sm:px-6 pb-8 max-w-5xl">
        <AccessMatrix initialLevels={levels} />
      </div>
    </>
  )
}
