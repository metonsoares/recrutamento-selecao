import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { perfilToRole } from '@/lib/permissions'

/** GET — lista usuários do sistema (criados a partir de colaboradores) */
export async function GET() {
  try {
    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const users = data.users
      .filter(u => (u.user_metadata?.code as string | undefined))
      .map(u => ({
        id: u.id,
        email: u.email ?? '',
        name: (u.user_metadata?.full_name as string | undefined) ?? '',
        code: (u.user_metadata?.code as string | undefined) ?? '',
        empresa: (u.user_metadata?.empresa as string | undefined) ?? '',
        perfil: (u.user_metadata?.perfil as string | undefined) ?? 'operador',
        candidate_id: (u.user_metadata?.candidate_id as string | undefined) ?? '',
      }))

    return NextResponse.json({ users })
  } catch (err) {
    console.error('[system-users GET]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/** POST — cria usuário do sistema a partir de um colaborador */
export async function POST(req: NextRequest) {
  try {
    const { candidate_id, full_name, email, password, code, empresa, perfil } = await req.json()
    if (!email?.trim()) return NextResponse.json({ error: 'E-mail é obrigatório.' }, { status: 400 })
    if (!code?.trim()) return NextResponse.json({ error: 'Código é obrigatório.' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase.auth.admin.createUser({
      email: email.trim(),
      password: password || '123456',
      email_confirm: true,
      user_metadata: {
        full_name: full_name || '',
        code: code.trim().toUpperCase(),
        empresa: empresa || '',
        perfil: perfil || 'operador',
        // role de acesso coerente com o perfil cadastrado (evita herdar Master)
        role: perfilToRole(perfil),
        candidate_id: candidate_id || '',
      },
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ user: data.user })
  } catch (err) {
    console.error('[system-users POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
