import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requireMasterApi } from '@/lib/auth-guard'

/** GET /api/admin/usuarios — lista todos os usuários */
export async function GET() {
  try {
    const denied = await requireMasterApi()
    if (denied) return denied
    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ users: data.users })
  } catch (err) {
    console.error('[usuarios GET]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/** POST /api/admin/usuarios — cria novo usuário */
export async function POST(req: NextRequest) {
  try {
    const denied = await requireMasterApi()
    if (denied) return denied
    const { name, email, password, role } = await req.json()
    if (!email?.trim() || !password?.trim()) {
      return NextResponse.json({ error: 'E-mail e senha são obrigatórios.' }, { status: 400 })
    }
    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: { full_name: name?.trim() || '', role: role || 'visualizador' },
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ user: data.user })
  } catch (err) {
    console.error('[usuarios POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
