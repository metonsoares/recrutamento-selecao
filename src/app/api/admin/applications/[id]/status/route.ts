import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { normalizeRole } from '@/lib/permissions'
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
    const role = normalizeRole(user.user_metadata?.role as string | undefined)
    const granted = await getGrantedPerms(role)
    if (!granted.has('candidatos.status')) {
      return NextResponse.json({ error: 'Sem permissão para alterar status.' }, { status: 403 })
    }

    const now = new Date().toISOString()
    const payload: Record<string, unknown> = { status, updated_at: now }
    if (status === 'desligado') payload.terminated_at = now
    // Bloqueio de freelancer: marca a flag (mantém abas de freelancer na ficha mesmo reprovado).
    // Qualquer status diferente de "reprovado" limpa o bloqueio (desbloqueio).
    if (status === 'reprovado') {
      if (freelancerBlocked === true) payload.freelancer_blocked = true
    } else {
      payload.freelancer_blocked = false
    }

    const supabase = await createSupabaseServiceClient()
    const { error } = await supabase.from('applications').update(payload).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[applications status PUT]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
