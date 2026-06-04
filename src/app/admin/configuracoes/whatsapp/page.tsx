import { requirePermission } from '@/lib/auth-guard'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { ZApiSettingsForm } from './zapi-settings-form'

export default async function WhatsAppConfigPage() {
  await requirePermission('config.whatsapp')
  const supabase = await createSupabaseServerClient()
  const { data: settings } = await supabase.from('whatsapp_settings').select('*').limit(1).single()
  const { data: logs } = await supabase
    .from('whatsapp_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)

  return <ZApiSettingsForm settings={settings} logs={logs || []} />
}
