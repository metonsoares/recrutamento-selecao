import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { encryptToken } from '@/lib/helpers'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const supabase = await createSupabaseServiceClient()

    const { data: existing } = await supabase.from('whatsapp_settings').select('id, instance_token_encrypted, client_token_encrypted').limit(1).single()

    const updateData: Record<string, unknown> = {
      instance_name: body.instance_name,
      instance_id: body.instance_id,
      whatsapp_number: body.whatsapp_number,
      attendant_name: body.attendant_name,
      api_base_url: body.api_base_url || 'https://api.z-api.io',
      environment: body.environment || 'production',
      is_active: body.is_active,
      updated_at: new Date().toISOString(),
    }

    if (body.instance_token) {
      updateData.instance_token_encrypted = encryptToken(body.instance_token)
    }
    if (body.client_token) {
      updateData.client_token_encrypted = encryptToken(body.client_token)
    }

    if (existing?.id) {
      await supabase.from('whatsapp_settings').update(updateData).eq('id', existing.id)
    } else {
      await supabase.from('whatsapp_settings').insert(updateData)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
