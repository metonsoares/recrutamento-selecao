import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    const supabase = await createSupabaseServiceClient()

    const hasError = !!payload?.error
    await supabase.from('whatsapp_logs').insert({
      direction: 'outbound',
      action: 'delivery_callback',
      phone: payload?.phone || null,
      status: hasError ? 'error' : 'delivered',
      message: hasError ? `Erro: ${payload.error}` : null,
      request_payload: payload,
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}
