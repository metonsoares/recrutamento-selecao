import { createSupabaseServerClient } from '@/lib/supabase-server'
import { EmpresaSettingsForm } from './empresa-settings-form'

export default async function EmpresaPage() {
  const supabase = await createSupabaseServerClient()
  const { data: settings } = await supabase.from('ai_settings').select('*').limit(1).single()
  return <EmpresaSettingsForm settings={settings} />
}
