import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabaseAuth = await createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const { key } = await req.json()
  const trimmed = (key ?? '').trim()
  if (!trimmed) return NextResponse.json({ error: 'Chave inválida.' }, { status: 400 })

  const service = await createSupabaseServiceClient()
  const { data: existing } = await service.from('ai_settings').select('id').limit(1).single()

  const payload = { escavador_api_key: trimmed }
  const { error } = existing?.id
    ? await service.from('ai_settings').update(payload).eq('id', existing.id)
    : await service.from('ai_settings').insert(payload)

  if (error) return NextResponse.json({ error: 'Erro ao salvar.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest) {
  const supabaseAuth = await createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const service = await createSupabaseServiceClient()
  const { data: existing } = await service.from('ai_settings').select('id').limit(1).single()
  if (existing?.id) {
    await service.from('ai_settings').update({ escavador_api_key: null }).eq('id', existing.id)
  }
  return NextResponse.json({ ok: true })
}
