import { cache } from 'react'
import type { User } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createPortalClient } from '@/lib/portal-supabase'
import { perfilToRole, roleFromMetadata, type Role } from '@/lib/permissions'

const APP_SLUG = 'recrutamento'

/**
 * Perfil de acesso lido AO VIVO no Supabase do Portal BDT (por e-mail).
 * - super_admin no Portal → 'master' (acesso direto a qualquer app);
 * - colaborador com perfil para o app Recrutamento → esse perfil;
 * - colaborador sem acesso ao app → 'externo' (sem painel);
 * - NÃO é colaborador do Portal (conta local) ou Portal indisponível → null (usa fallback do metadata).
 * Memoizado por request.
 */
export const resolvePortalRole = cache(async (email: string): Promise<Role | null> => {
  if (!email) return null
  const portal = createPortalClient()
  if (!portal) return null
  try {
    const { data: colab } = await portal
      .from('colaboradores').select('id, user_id').ilike('email', email).limit(1).maybeSingle()
    if (!colab) return null // conta local (ex.: Master) — resolve pelo metadata

    if (colab.user_id) {
      const { data: prof } = await portal
        .from('profiles').select('is_super_admin').eq('id', colab.user_id).maybeSingle()
      if (prof?.is_super_admin === true) return 'master'
    }

    const { data: app } = await portal.from('apps').select('id').eq('slug', APP_SLUG).maybeSingle()
    if (!app) return null
    const { data: ca } = await portal
      .from('colaborador_apps').select('perfil').eq('colaborador_id', colab.id).eq('app_id', app.id).maybeSingle()
    if (!ca?.perfil) return 'externo' // colaborador sem acesso a este app
    return perfilToRole(ca.perfil as string)
  } catch {
    return null
  }
})

/**
 * Usuário logado + perfil efetivo. Prioriza o perfil AO VIVO do Portal;
 * cai no metadata (perfil ?? role) quando o Portal não resolve (conta local / sem config).
 * Memoizado por request (layout + guards + páginas consultam uma única vez).
 */
export const getEffectiveRole = cache(async (): Promise<{ user: User | null; role: Role }> => {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, role: 'externo' }
  const portalRole = await resolvePortalRole(user.email ?? '')
  return { user, role: portalRole ?? roleFromMetadata(user.user_metadata) }
})
