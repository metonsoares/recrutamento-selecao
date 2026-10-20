import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requirePermissionApi } from '@/lib/auth-guard'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/whatsapp/conversation/[id]/mensagens
 *
 * Mensagens de uma conversa. Substitui a leitura que a tela fazia direto do
 * navegador em `whatsapp_messages`, que dependia da policy
 * `ALL/authenticated/USING(true)` — qualquer conta logada lia a conversa de
 * qualquer candidato.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requirePermissionApi('whatsapp.ver')
    if (denied) return denied

    const { id } = await ctx.params
    if (!id) return NextResponse.json({ error: 'Conversa não informada.' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('whatsapp_messages')
      .select('id, direction, message_text, created_at, zapi_message_id')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, mensagens: data ?? [] })
  } catch (err) {
    console.error('[whatsapp mensagens GET]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
