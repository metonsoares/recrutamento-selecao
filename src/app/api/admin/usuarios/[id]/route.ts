import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

/** PUT /api/admin/usuarios/[id] — atualiza nome, e-mail e/ou senha */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { name, email, password } = await req.json()

    const supabase = await createSupabaseServiceClient()

    const updatePayload: Record<string, unknown> = {
      user_metadata: { full_name: name?.trim() || '' },
    }
    if (email?.trim()) updatePayload.email = email.trim()
    if (password?.trim()) updatePayload.password = password.trim()

    const { data, error } = await supabase.auth.admin.updateUserById(id, updatePayload)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ user: data.user })
  } catch (err) {
    console.error('[usuarios PUT]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/** DELETE /api/admin/usuarios/[id] — remove usuário */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createSupabaseServiceClient()
    const { error } = await supabase.auth.admin.deleteUser(id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[usuarios DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
