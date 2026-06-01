import { redirect } from 'next/navigation'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { AdminNav } from '@/components/admin/sidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const role = ((user.user_metadata?.role as string | undefined) === 'recrutador'
    ? 'recrutador'
    : 'master') as 'master' | 'recrutador'

  // Fetch branding from ai_settings (service client to bypass RLS)
  const serviceClient = await createSupabaseServiceClient()
  const { data: brandSettings } = await serviceClient
    .from('ai_settings')
    .select('logo_url, company_name')
    .limit(1)
    .single()

  return (
    <div className="min-h-screen bg-muted/30">
      <AdminNav
        logoUrl={brandSettings?.logo_url ?? null}
        companyName={brandSettings?.company_name ?? null}
        role={role}
      />
      <main className="lg:pl-64 min-h-screen">
        {children}
      </main>
    </div>
  )
}
