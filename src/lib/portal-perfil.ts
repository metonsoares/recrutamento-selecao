import { cache } from 'react'
import type { User } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createPortalClient } from '@/lib/portal-supabase'
import { perfilToRole, roleFromMetadata, type Role } from '@/lib/permissions'

/**
 * Perfil de acesso lido AO VIVO no Supabase do Portal BDT (RPC pública por e-mail).
 * - super_admin no Portal → 'master' (acesso direto a qualquer app);
 * - colaborador com perfil para o app Recrutamento → esse perfil;
 * - colaborador sem acesso ao app → 'externo' (sem painel);
 * - NÃO é colaborador (conta local) ou Portal indisponível → null (usa fallback do metadata).
 * Memoizado por request.
 */
export const resolvePortalRole = cache(async (email: string): Promise<Role | null> => {
  if (!email) return null
  try {
    const portal = createPortalClient()
    const { data, error } = await portal.rpc('recrutamento_perfil', { p_email: email })
    if (error) return null
    const perfil = (data as string | null)?.trim()
    if (!perfil) return null
    return perfil === 'master' ? 'master' : perfilToRole(perfil)
  } catch {
    return null
  }
})

/**
 * Usuário logado + perfil efetivo. Prioriza o perfil AO VIVO do Portal;
 * cai no metadata (perfil ?? role) quando o Portal não resolve (conta local).
 * Memoizado por request.
 */
export const getEffectiveRole = cache(async (): Promise<{ user: User | null; role: Role }> => {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, role: 'externo' }
  const portalRole = await resolvePortalRole(user.email ?? '')
  return { user, role: portalRole ?? roleFromMetadata(user.user_metadata) }
})
