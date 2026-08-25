import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { AdminNav } from '@/components/admin/sidebar'
import { PresenceHeartbeat } from '@/components/PresenceHeartbeat'
import { getEffectiveRole } from '@/lib/portal-perfil'
import { getGrantedPerms } from '@/lib/permissions-server'
import { ROLE_LABELS, ALL_ROLES, type Role } from '@/lib/permissions'

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

  // Pré-visualização: o master pode ver o MENU como outro perfil (o Portal abre
  // com ?perfil=…&preview=1 e o proxy guarda num cookie). É só a tela — todo
  // guard de página e de API continua usando o papel REAL, logo isto não
  // concede nem restringe acesso a nada.
  const podePreVisualizar = role === 'master' || role === 'admin'
  const cookiePreview = (await cookies()).get('bdt_preview_perfil')?.value
  const perfilPreview: Role | null =
    podePreVisualizar && cookiePreview && (ALL_ROLES as string[]).includes(cookiePreview)
      && cookiePreview !== role
      ? (cookiePreview as Role)
      : null

  // Fetch branding from ai_settings (service client to bypass RLS)
  const serviceClient = await createSupabaseServiceClient()
  const [{ data: brandSettings }, granted] = await Promise.all([
    serviceClient.from('ai_settings').select('logo_url, company_name').limit(1).single(),
    getGrantedPerms(perfilPreview ?? role),
  ])

  return (
    <div className="min-h-screen bg-muted/30">
      <AdminNav
        logoUrl={brandSettings?.logo_url ?? null}
        companyName={brandSettings?.company_name ?? null}
        role={perfilPreview ?? role}
        perms={Array.from(granted)}
      />
      <PresenceHeartbeat />

      {perfilPreview && (
        <div className="lg:pl-72">
          <div className="m-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 flex items-center gap-2 flex-wrap">
            <span className="text-[13px] text-amber-900">
              Você está vendo o menu como <strong>{ROLE_LABELS[perfilPreview]}</strong>.
              Isto muda só a tela — seus acessos continuam os de {ROLE_LABELS[role]}.
            </span>
            <a href="/admin?preview=0"
              className="ml-auto text-[13px] font-semibold text-amber-900 underline underline-offset-2">
              Sair da pré-visualização
            </a>
          </div>
        </div>
      )}
      <main className="lg:pl-72 min-h-screen">
        {children}
      </main>
    </div>
  )
}
