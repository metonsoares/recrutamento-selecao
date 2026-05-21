import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { scrapeJusBrasilAuthenticated } from '@/lib/jusbrasil-scraper'

export const maxDuration = 90

export async function POST(_req: NextRequest) {
  // Auth check
  const supabaseAuth = await createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  // Load credentials from DB
  const service = await createSupabaseServiceClient()
  const { data: settings } = await service
    .from('ai_settings')
    .select('jusbrasil_email, jusbrasil_password')
    .limit(1)
    .single()

  const email = settings?.jusbrasil_email || process.env.JUSBRASIL_EMAIL
  const password = settings?.jusbrasil_password || process.env.JUSBRASIL_PASSWORD

  if (!email || !password) {
    return NextResponse.json({
      ok: false,
      error: 'Credenciais não configuradas. Salve o e-mail e senha antes de testar.',
    })
  }

  // Use a known public name to test (just verifies login works, not real data)
  const result = await scrapeJusBrasilAuthenticated(
    'teste conexão',   // nome fictício — só queremos ver se o login ocorre
    null,
    { email, password },
  )

  if (result.authenticated) {
    return NextResponse.json({
      ok: true,
      message: `Login realizado com sucesso na conta ${email}. A consulta processual está acessível.`,
    })
  }

  return NextResponse.json({
    ok: false,
    error: result.error || 'Login falhou. Verifique o e-mail e senha informados.',
  })
}
