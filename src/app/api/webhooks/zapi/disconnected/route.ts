import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    const supabase = await createSupabaseServiceClient()
    await supabase.from('whatsapp_logs').insert({
      action: 'disconnected',
      status: 'disconnected',
      request_payload: payload,
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}
