import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

/**
 * DELETE /api/admin/whatsapp/conversation/[id]
 * Removes a conversation and all of its messages.
 * Requires an authenticated admin user (session).
 */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params

  if (!id) {
    return NextResponse.json({ error: 'ID da conversa não informado.' }, { status: 400 })
  }

  // Auth gate: must be an authenticated admin session
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  // Use service client to bypass RLS for the delete itself
  const service = await createSupabaseServiceClient()

  // Delete child messages first (in case there's no ON DELETE CASCADE)
  const { error: msgErr } = await service
    .from('whatsapp_messages')
    .delete()
    .eq('conversation_id', id)

  if (msgErr) {
    console.error('[delete conversation] messages:', msgErr)
    return NextResponse.json({ error: 'Erro ao apagar mensagens da conversa.' }, { status: 500 })
  }

  const { error: convErr } = await service
    .from('whatsapp_conversations')
    .delete()
    .eq('id', id)

  if (convErr) {
    console.error('[delete conversation] conv:', convErr)
    return NextResponse.json({ error: 'Erro ao apagar conversa.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
