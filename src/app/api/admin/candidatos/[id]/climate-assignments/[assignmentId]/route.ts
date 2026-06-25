import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { normalizeRole } from '@/lib/permissions'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; assignmentId: string }> }) {
  try {
    const { id, assignmentId } = await params

    // Apenas perfil master pode remover
    const authClient = await createSupabaseServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    const role = normalizeRole((user.user_metadata?.perfil ?? user.user_metadata?.role) as string | undefined)
    if (role !== 'master') return NextResponse.json({ error: 'Sem permissão para remover.' }, { status: 403 })

    const supabase = await createSupabaseServiceClient()
    const { error } = await supabase
      .from('climate_assignments')
      .delete()
      .eq('id', assignmentId)
      .eq('candidate_id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[climate-assignments DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
