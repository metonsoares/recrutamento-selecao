import { createSupabaseServerClient } from '@/lib/supabase-server'
import { IaSettingsForm } from './ia-settings-form'

export const dynamic = 'force-dynamic'

export default async function IaConfigPage() {
  const supabase = await createSupabaseServerClient()
  const { data: settings } = await supabase
    .from('ai_settings')
    .select(
      'id, anthropic_api_key_encrypted, openai_api_key_encrypted,' +
      'analysis_provider, analysis_prompt,' +
      'whatsapp_provider, whatsapp_agent_prompt,' +
      'company_provider, company_prompt'
    )
    .limit(1)
    .maybeSingle()

  return (
    <IaSettingsForm
      hasAnthropicKey={!!settings?.anthropic_api_key_encrypted}
      hasOpenaiKey={!!settings?.openai_api_key_encrypted}
      settingsId={settings?.id ?? null}
      analysisProvider={(settings?.analysis_provider as 'anthropic' | 'openai' | null) ?? null}
      analysisPrompt={settings?.analysis_prompt ?? ''}
      whatsappProvider={(settings?.whatsapp_provider as 'anthropic' | 'openai' | null) ?? null}
      whatsappPrompt={settings?.whatsapp_agent_prompt ?? ''}
      companyProvider={(settings?.company_provider as 'anthropic' | 'openai' | null) ?? null}
      companyPrompt={settings?.company_prompt ?? ''}
    />
  )
}
