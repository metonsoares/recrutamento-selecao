import { createSupabaseServerClient } from '@/lib/supabase-server'
import { AiSettingsForm } from './ai-settings-form'

export default async function IAPage() {
  const supabase = await createSupabaseServerClient()
  const { data: settings } = await supabase.from('ai_settings').select('*').limit(1).single()
  return <AiSettingsForm settings={settings} />
}
