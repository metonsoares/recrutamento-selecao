import { requirePermission } from '@/lib/auth-guard'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { IaSettingsForm } from './ia-settings-form'

export const dynamic = 'force-dynamic'

type AiSettingsRow = {
  id: string
  anthropic_api_key_encrypted: string | null
  openai_api_key_encrypted: string | null
  analysis_provider: 'anthropic' | 'openai' | null
  analysis_prompt: string | null
  whatsapp_provider: 'anthropic' | 'openai' | null
  whatsapp_agent_prompt: string | null
  company_provider: 'anthropic' | 'openai' | null
  company_prompt: string | null
  search_url_1: string | null
  search_url_1_label: string | null
  search_url_2: string | null
  search_url_2_label: string | null
  search_url_3: string | null
  search_url_3_label: string | null
  datajud_api_key: string | null
  escavador_api_key: string | null
  transparencia_api_key: string | null
}

export default async function IaConfigPage() {
  await requirePermission('config.ia')
  const supabase = await createSupabaseServerClient()
  const { data: settings } = await supabase
    .from('ai_settings')
    .select(
      'id, anthropic_api_key_encrypted, openai_api_key_encrypted,' +
      'analysis_provider, analysis_prompt,' +
      'whatsapp_provider, whatsapp_agent_prompt,' +
      'company_provider, company_prompt,' +
      'search_url_1, search_url_1_label,' +
      'search_url_2, search_url_2_label,' +
      'search_url_3, search_url_3_label,' +
      'datajud_api_key, escavador_api_key, transparencia_api_key'
    )
    .limit(1)
    .maybeSingle() as { data: AiSettingsRow | null }

  return (
    <IaSettingsForm
      hasAnthropicKey={!!settings?.anthropic_api_key_encrypted}
      hasOpenaiKey={!!settings?.openai_api_key_encrypted}
      settingsId={settings?.id ?? null}
      analysisProvider={settings?.analysis_provider ?? null}
      analysisPrompt={settings?.analysis_prompt ?? ''}
      whatsappProvider={settings?.whatsapp_provider ?? null}
      whatsappPrompt={settings?.whatsapp_agent_prompt ?? ''}
      companyProvider={settings?.company_provider ?? null}
      companyPrompt={settings?.company_prompt ?? ''}
      hasEscavadorKey={!!settings?.escavador_api_key}
      hasTransparenciaKey={!!settings?.transparencia_api_key}
    />
  )
}
