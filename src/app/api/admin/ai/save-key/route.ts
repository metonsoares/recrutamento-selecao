import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { encryptToken } from '@/lib/helpers'

export async function POST(req: NextRequest) {
  try {
    const { key, provider = 'anthropic', settingsId } = await req.json()

    if (!key || typeof key !== 'string' || key.trim().length < 10) {
      return NextResponse.json({ error: 'Chave inválida' }, { status: 400 })
    }

    const encrypted = encryptToken(key.trim())
    const supabase = await createSupabaseServiceClient()

    // Determina qual coluna atualizar com base no provider
    const fieldMap: Record<string, string> = {
      anthropic: 'anthropic_api_key_encrypted',
      openai: 'openai_api_key_encrypted',
    }
    const field = fieldMap[provider]
    if (!field) {
      return NextResponse.json({ error: 'Provider inválido' }, { status: 400 })
    }

    if (settingsId) {
      await supabase
        .from('ai_settings')
        .update({ [field]: encrypted, updated_at: new Date().toISOString() })
        .eq('id', settingsId)
    } else {
      // Verifica se já existe um registro
      const { data: existing } = await supabase
        .from('ai_settings')
        .select('id')
        .limit(1)
        .single()

      if (existing?.id) {
        await supabase
          .from('ai_settings')
          .update({ [field]: encrypted, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
      } else {
        await supabase
          .from('ai_settings')
          .insert({ [field]: encrypted } as Record<string, unknown>)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[save-key]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
