import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import {
  roleFromMetadata, ALL_ROLES, PERMISSION_MATRIX, MASTER_ONLY_PERMS, LEVELS,
  type Role, type Level,
} from '@/lib/permissions'
import { resolvePortalRole } from '@/lib/portal-perfil'

const VALID_PERMS = new Set(PERMISSION_MATRIX.map(r => r.perm))
const VALID_LEVELS = new Set(LEVELS)

export async function PUT(req: NextRequest) {
  try {
    // Apenas master pode alterar permissões
    const auth = await createSupabaseServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    const role = (await resolvePortalRole(user.email ?? '')) ?? roleFromMetadata(user.user_metadata)
    if (role !== 'master') {
      return NextResponse.json({ error: 'Apenas o perfil Master pode alterar permissões.' }, { status: 403 })
    }

    const body = await req.json()
    const levels = body.levels as Record<string, Record<string, string>>
    if (!levels || typeof levels !== 'object') return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 })

    const rows: { role: string; perm: string; level: string; updated_at: string }[] = []
    const now = new Date().toISOString()
    for (const role of ALL_ROLES) {
      const roleMap = levels[role] || {}
      for (const { perm } of PERMISSION_MATRIX) {
        if (!VALID_PERMS.has(perm)) continue
        // Regras fixas: módulos master-only não são editáveis
        let level = (roleMap[perm] as Level) || 'none'
        if (!VALID_LEVELS.has(level)) level = 'none'
        if ((MASTER_ONLY_PERMS as string[]).includes(perm)) {
          level = role === 'master' ? 'full' : 'none'
        }
        rows.push({ role, perm, level, updated_at: now })
      }
    }

    const supabase = await createSupabaseServiceClient()
    const { error } = await supabase.from('role_permissions').upsert(rows, { onConflict: 'role,perm' })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[role-permissions PUT]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
