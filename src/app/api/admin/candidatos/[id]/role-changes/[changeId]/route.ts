import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requirePermissionApi } from '@/lib/auth-guard'

/**
 * DELETE — apaga um registro da linha do tempo de funções.
 *
 * De propósito NÃO mexe na função atual da ficha: apagar um lançamento errado
 * não deveria "desfazer" a função vigente sem que alguém decida qual é. Se a
 * ficha tiver de voltar, registre a mudança correta.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; changeId: string }> },
) {
  try {
    const denied = await requirePermissionApi('ficha.admissao')
    if (denied) return denied

    const { id, changeId } = await params
    const supabase = await createSupabaseServiceClient()

    // Amarra ao candidato da rota: sem isso, um id solto apagaria o registro
    // de outra pessoa.
    const { error } = await supabase
      .from('role_changes')
      .delete()
      .eq('id', changeId)
      .eq('candidate_id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[role-changes DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
