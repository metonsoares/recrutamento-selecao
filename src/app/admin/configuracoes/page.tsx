import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import AdminHeader from '../AdminHeader'
import ConfiguracoesSurvey from './ConfiguracoesSurvey'

export const dynamic = 'force-dynamic'

export default async function ConfiguracoesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const admin = await createAdminClient()

  const { data: survey } = await admin
    .from('surveys')
    .select('id, title, description, status, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (
    <div className="min-h-screen bg-muted">
      <AdminHeader userEmail={user.email ?? ''} />
      <ConfiguracoesSurvey survey={survey ?? null} />
    </div>
  )
}
