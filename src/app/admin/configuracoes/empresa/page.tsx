import { requirePermission } from '@/lib/auth-guard'
// Autorização = requirePermission('config.empresa_cultura') abaixo; o client de
// serviço libera a remoção da policy ALL/authenticated/true de ai_settings.
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { EmpresaSettingsForm } from './empresa-settings-form'

export default async function EmpresaPage() {
  await requirePermission('config.empresa_cultura')
  const supabase = await createSupabaseServiceClient()
  const { data: settings } = await supabase.from('ai_settings').select('*').limit(1).single()
  return <EmpresaSettingsForm settings={settings} />
}
