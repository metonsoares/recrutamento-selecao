import { createSupabaseServerClient } from '@/lib/supabase-server'
import { IaSettingsForm } from './ia-settings-form'

export const dynamic = 'force-dynamic'

export default async function IaConfigPage() {
  const supabase = await createSupabaseServerClient()
  const { data: settings } = await supabase
    .from('ai_settings')
    .select('id, anthropic_api_key_encrypted, openai_api_key_encrypted')
    .limit(1)
    .single()

  return (
    <IaSettingsForm
      hasAnthropicKey={!!settings?.anthropic_api_key_encrypted}
      hasOpenaiKey={!!settings?.openai_api_key_encrypted}
      settingsId={settings?.id ?? null}
    />
  )
}
