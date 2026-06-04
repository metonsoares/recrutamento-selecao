import { redirect } from 'next/navigation'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { normalizeRole } from '@/lib/permissions'
import { AuditoriaManager, AuditLog } from './auditoria-manager'

export const dynamic = 'force-dynamic'

export default async function AuditoriaPage() {
  const auth = await createSupabaseServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')
  const isMaster = normalizeRole(user.user_metadata?.role as string | undefined) === 'master'
  if (!isMaster) redirect('/admin')

  const service = await createSupabaseServiceClient()
  const { data: logs } = await service
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(2000)

  return <AuditoriaManager logs={(logs || []) as AuditLog[]} />
}
