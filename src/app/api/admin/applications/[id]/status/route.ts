import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { roleFromMetadata } from '@/lib/permissions'
import { resolvePortalRole } from '@/lib/portal-perfil'
import { getGrantedPerms } from '@/lib/permissions-server'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { status, freelancerBlocked } = await req.json()
    if (!status) return NextResponse.json({ error: 'Status obrigatório.' }, { status: 400 })

    // Autorização: precisa da permissão de mudar status
    const auth = await createSupabaseServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    const role = (await resolvePortalRole(user.email ?? '')) ?? roleFromMetadata(user.user_metadata)
    const granted = await getGrantedPerms(role)
    if (!granted.has('candidatos.status')) {
      return NextResponse.json({ error: 'Sem permissão para alterar status.' }, { status: 403 })
    }

    const supabase = await createSupabaseServiceClient()

    // Status atual — usado para detectar a transição freelancer → reprovado
    const { data: current } = await supabase
      .from('applications').select('status').eq('id', id).single()

    const now = new Date().toISOString()
    const payload: Record<string, unknown> = { status, updated_at: now }
    if (status === 'desligado') payload.terminated_at = now
    // Freelancer bloqueado: marca a flag quando um freelancer vira "reprovado"
    // (pelo botão "Bloquear Freelancer" OU pelo seletor de status). Mantém as abas
    // de freelancer na ficha. Qualquer status diferente de "reprovado" limpa o bloqueio.
    if (status === 'reprovado') {
      if (current?.status === 'freelancer' || freelancerBlocked === true) {
        payload.freelancer_blocked = true
      }
    } else {
      payload.freelancer_blocked = false
    }

    const { error } = await supabase.from('applications').update(payload).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[applications status PUT]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
