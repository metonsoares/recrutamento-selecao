import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requirePermissionApi } from '@/lib/auth-guard'

/**
 * PATCH — atualiza nome, e-mail e telefone do colaborador a partir da Ficha
 * do Funcionário. Escopo propositalmente restrito a esses três campos: CPF e
 * endereço continuam só no PATCH de /api/admin/candidatos/[id], que é Master.
 * Liberado para quem edita a ficha (permissão ficha.admissao).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requirePermissionApi('ficha.admissao')
    if (denied) return denied

    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const update: Record<string, unknown> = {}

    if (typeof body.full_name === 'string') {
      const nome = body.full_name.trim()
      if (!nome) return NextResponse.json({ error: 'O nome não pode ficar vazio.' }, { status: 400 })
      update.full_name = nome
    }
    if (typeof body.email === 'string') {
      const email = body.email.trim().toLowerCase()
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 })
      }
      update.email = email || null
    }
    if (typeof body.phone === 'string') {
      const phone = body.phone.trim()
      update.phone = phone || null
      update.phone_normalized = phone.replace(/\D/g, '') || null
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 })
    }
    update.updated_at = new Date().toISOString()

    const supabase = await createSupabaseServiceClient()
    const { error } = await supabase.from('candidates').update(update).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[candidato contato PATCH]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
