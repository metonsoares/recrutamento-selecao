import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

type Service = 'analysis' | 'whatsapp' | 'company'

const SERVICE_FIELDS: Record<Service, { provider: string; prompt: string }> = {
  analysis: { provider: 'analysis_provider',  prompt: 'analysis_prompt' },
  whatsapp: { provider: 'whatsapp_provider',  prompt: 'whatsapp_agent_prompt' },
  company:  { provider: 'company_provider',   prompt: 'company_prompt' },
}

/**
 * POST /api/admin/ai/save-service-config
 * Body: { service: 'analysis'|'whatsapp'|'company', provider: 'anthropic'|'openai'|null, prompt: string }
 */
export async function POST(req: NextRequest) {
  // Auth
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const body = await req.json()
  const { service, provider, prompt } = body as {
    service: Service
    provider: 'anthropic' | 'openai' | null
    prompt: string
  }

  if (!SERVICE_FIELDS[service]) {
    return NextResponse.json({ error: 'Serviço inválido.' }, { status: 400 })
  }

  const fields = SERVICE_FIELDS[service]
  const service_client = await createSupabaseServiceClient()

  // Upsert into ai_settings (always a single row)
  const { data: existing } = await service_client
    .from('ai_settings')
    .select('id')
    .limit(1)
    .maybeSingle()

  const payload = {
    [fields.provider]: provider ?? null,
    [fields.prompt]: prompt ?? null,
    updated_at: new Date().toISOString(),
  }

  if (existing?.id) {
    const { error } = await service_client
      .from('ai_settings')
      .update(payload)
      .eq('id', existing.id)
    if (error) return NextResponse.json({ error: 'Erro ao salvar.' }, { status: 500 })
  } else {
    const { error } = await service_client
      .from('ai_settings')
      .insert(payload)
    if (error) return NextResponse.json({ error: 'Erro ao salvar.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
