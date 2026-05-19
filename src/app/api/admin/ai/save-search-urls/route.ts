import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

/**
 * POST /api/admin/ai/save-search-urls
 * Body: {
 *   search_url_1: string, search_url_1_label: string,
 *   search_url_2: string, search_url_2_label: string,
 *   search_url_3: string, search_url_3_label: string,
 * }
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const body = await req.json()
  const {
    search_url_1, search_url_1_label,
    search_url_2, search_url_2_label,
    search_url_3, search_url_3_label,
  } = body as Record<string, string>

  const serviceClient = await createSupabaseServiceClient()

  const { data: existing } = await serviceClient
    .from('ai_settings')
    .select('id')
    .limit(1)
    .maybeSingle()

  const payload = {
    search_url_1: search_url_1 || null,
    search_url_1_label: search_url_1_label || null,
    search_url_2: search_url_2 || null,
    search_url_2_label: search_url_2_label || null,
    search_url_3: search_url_3 || null,
    search_url_3_label: search_url_3_label || null,
    updated_at: new Date().toISOString(),
  }

  if (existing?.id) {
    const { error } = await serviceClient
      .from('ai_settings')
      .update(payload)
      .eq('id', existing.id)
    if (error) return NextResponse.json({ error: 'Erro ao salvar.' }, { status: 500 })
  } else {
    const { error } = await serviceClient
      .from('ai_settings')
      .insert(payload)
    if (error) return NextResponse.json({ error: 'Erro ao salvar.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
