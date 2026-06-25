import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { roleFromMetadata } from '@/lib/permissions'
import { resolvePortalRole } from '@/lib/portal-perfil'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; responseId: string }> }) {
  try {
    const { id, responseId } = await params

    // Apenas perfil master pode remover respostas
    const authClient = await createSupabaseServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    const role = (await resolvePortalRole(user.email ?? '')) ?? roleFromMetadata(user.user_metadata)
    if (role !== 'master') return NextResponse.json({ error: 'Sem permissão para remover respostas.' }, { status: 403 })

    const supabase = await createSupabaseServiceClient()
    const { error } = await supabase
      .from('climate_responses')
      .delete()
      .eq('id', responseId)
      .eq('survey_id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[climate response DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
