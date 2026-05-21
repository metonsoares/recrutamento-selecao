import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  // Auth check
  const supabaseAuth = await createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const body = await req.json()
  const email: string = (body.email ?? '').trim()
  const password: string = (body.password ?? '').trim()

  if (!email || !password) {
    return NextResponse.json({ error: 'E-mail e senha são obrigatórios.' }, { status: 400 })
  }

  // Basic email validation
  if (!email.includes('@')) {
    return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 })
  }

  const service = await createSupabaseServiceClient()

  // Upsert on ai_settings — there's always exactly one row
  const { data: existing } = await service.from('ai_settings').select('id').limit(1).single()

  let error: Error | null = null

  if (existing?.id) {
    const { error: e } = await service
      .from('ai_settings')
      .update({ jusbrasil_email: email, jusbrasil_password: password })
      .eq('id', existing.id)
    error = e
  } else {
    const { error: e } = await service
      .from('ai_settings')
      .insert({ jusbrasil_email: email, jusbrasil_password: password })
    error = e
  }

  if (error) {
    console.error('[save-jusbrasil-credentials]', error)
    return NextResponse.json({ error: 'Erro ao salvar credenciais.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

/**
 * DELETE — remove as credenciais JusBrasil salvas
 */
export async function DELETE(_req: NextRequest) {
  const supabaseAuth = await createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const service = await createSupabaseServiceClient()

  const { data: existing } = await service.from('ai_settings').select('id').limit(1).single()
  if (existing?.id) {
    await service
      .from('ai_settings')
      .update({ jusbrasil_email: null, jusbrasil_password: null })
      .eq('id', existing.id)
  }

  return NextResponse.json({ ok: true })
}
