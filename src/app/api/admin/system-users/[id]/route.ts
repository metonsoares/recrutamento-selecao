import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { full_name, email, password, code, empresa, perfil, candidate_id } = await req.json()
    const supabase = await createSupabaseServiceClient()
    const payload: Record<string, unknown> = {
      user_metadata: {
        full_name: full_name || '',
        code: (code || '').toUpperCase(),
        empresa: empresa || '',
        perfil: perfil || 'operador',
        candidate_id: candidate_id || '',
      },
    }
    if (email?.trim()) payload.email = email.trim()
    if (password?.trim()) payload.password = password.trim()
    const { data, error } = await supabase.auth.admin.updateUserById(id, payload)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ user: data.user })
  } catch (err) {
    console.error('[system-users PUT]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createSupabaseServiceClient()
    const { error } = await supabase.auth.admin.deleteUser(id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[system-users DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
