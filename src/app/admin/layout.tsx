import { redirect } from 'next/navigation'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { AdminNav } from '@/components/admin/sidebar'
import { normalizeRole } from '@/lib/permissions'
import { getGrantedPerms } from '@/lib/permissions-server'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const role = normalizeRole(user.user_metadata?.role as string | undefined)

  // Operador não tem nenhuma permissão de acesso ao painel
  if (role === 'operador') {
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
      <main className="lg:pl-72 min-h-screen">
        {children}
      </main>
    </div>
  )
}
