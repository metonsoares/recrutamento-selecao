import { NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { normalizeRole, ROLE_LABELS } from '@/lib/permissions'

/**
 * GET /api/admin/recruiters
 * Lista os usuários do painel (recrutadores) para seleção em "Notificar recrutador".
 * Retorna nome, perfil e telefone (WhatsApp) — sem dados sensíveis.
 */
export async function GET() {
  try {
    const auth = await createSupabaseServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

    const service = await createSupabaseServiceClient()
    const { data, error } = await service.auth.admin.listUsers({ perPage: 200 })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const recruiters = data.users
      // só usuários do painel (têm role definido); ignora cadastros sem perfil
      .filter(u => u.user_metadata?.role || u.user_metadata?.full_name)
      .map(u => {
        const role = normalizeRole(u.user_metadata?.role as string | undefined)
        return {
          id: u.id,
          name: (u.user_metadata?.full_name as string | undefined)?.trim() || (u.email ?? 'Sem nome'),
          role,
          roleLabel: ROLE_LABELS[role] ?? role,
          phone: (u.user_metadata?.phone as string | undefined)?.trim() || '',
        }
      })
      .filter(r => r.role !== 'operador') // operador não acessa o painel
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

    return NextResponse.json({ recruiters })
  } catch (err) {
    console.error('[recruiters GET]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
