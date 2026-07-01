import { redirect } from 'next/navigation'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { AdminNav } from '@/components/admin/sidebar'
import { PresenceHeartbeat } from '@/components/PresenceHeartbeat'
import { getEffectiveRole } from '@/lib/portal-perfil'
import { getGrantedPerms } from '@/lib/permissions-server'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, role } = await getEffectiveRole()

  if (!user) redirect('/login')

  // Operador e Usuário Externo não têm acesso ao painel
  if (role === 'operador' || role === 'externo') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6 text-center">
        <div className="max-w-sm">
          <h1 className="text-xl font-bold text-gray-900">Acesso restrito</h1>
          <p className="text-sm text-muted-foreground mt-2">Seu perfil não tem permissão para acessar o painel administrativo. Fale com um administrador.</p>
        </div>
      </div>
    )
  }

  // Fetch branding from ai_settings (service client to bypass RLS)
  const serviceClient = await createSupabaseServiceClient()
  const [{ data: brandSettings }, granted] = await Promise.all([
    serviceClient.from('ai_settings').select('logo_url, company_name').limit(1).single(),
    getGrantedPerms(role),
  ])

  return (
    <div className="min-h-screen bg-muted/30">
      <AdminNav
        logoUrl={brandSettings?.logo_url ?? null}
        companyName={brandSettings?.company_name ?? null}
        role={role}
        perms={Array.from(granted)}
      />
      <PresenceHeartbeat />
      <main className="lg:pl-72 min-h-screen">
        {children}
      </main>
    </div>
  )
}
