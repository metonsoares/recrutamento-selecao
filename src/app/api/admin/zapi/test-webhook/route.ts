import { NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

/**
 * Sends a simulated inbound message to our own webhook and reports the result.
 * Uses a clearly fake phone number so it never creates real data.
 */
export async function POST() {
  try {
    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://recrutamento-selecao-ashen.vercel.app'
    const webhookUrl = `${appUrl}/api/webhooks/zapi/received`

    const testPayload = {
      text: { message: 'Teste de webhook da plataforma 🔧' },
      type: 'ReceivedCallback',
      phone: '00000000000',   // fake number — never creates a real contact
      fromMe: false,
      isGroup: false,
      status: 'RECEIVED',
      instanceId: 'TEST',
      __is_webhook_test: true,
    }

    const start = Date.now()
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload),
    })
    const elapsed = Date.now() - start

    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        error: `Webhook respondeu com HTTP ${res.status}`,
        elapsed_ms: elapsed,
      })
    }

    // Check if the log was created
    const supabase = await createSupabaseServiceClient()
    const { data: lastLog } = await supabase
      .from('whatsapp_logs')
      .select('id, action, created_at')
      .eq('phone', '00000000000')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    return NextResponse.json({
      ok: true,
      webhook_responded: true,
      status_code: res.status,
      elapsed_ms: elapsed,
      log_created: !!lastLog,
      message: `Webhook respondeu em ${elapsed}ms ✓`,
    })
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: `Erro ao chamar webhook: ${String(err)}`,
    })
  }
}
