import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { encryptToken } from '@/lib/helpers'

export async function POST(req: NextRequest) {
  try {
    const { key, settingsId } = await req.json()

    if (!key || typeof key !== 'string' || key.trim().length < 10) {
      return NextResponse.json({ error: 'Chave inválida' }, { status: 400 })
    }

    const encrypted = encryptToken(key.trim())
    const supabase = await createSupabaseServiceClient()

    if (settingsId) {
      await supabase
        .from('ai_settings')
        .update({ anthropic_api_key_encrypted: encrypted, updated_at: new Date().toISOString() })
        .eq('id', settingsId)
    } else {
      // Cria registro se não existir
      await supabase
        .from('ai_settings')
        .insert({ anthropic_api_key_encrypted: encrypted })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[save-key]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
