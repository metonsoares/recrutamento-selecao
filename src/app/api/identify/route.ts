import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isRateLimited, getClientIp } from '@/lib/rateLimit'

export async function POST(request: NextRequest) {
  // A2: rate limit — 30 requisições por IP a cada 5 minutos
  const ip = getClientIp(request.headers)
  if (isRateLimited(ip, 30, 5 * 60_000)) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' },
      { status: 429 }
    )
  }

  try {
    const body = await request.json()
    const { name, role, accessCode } = body as {
      name?: string
      role?: string
      accessCode?: string
    }

    if (!name?.trim() || name.trim().length < 2 || name.trim().length > 200) {
      return NextResponse.json(
        { error: 'Nome inválido. Informe seu nome completo.' },
        { status: 400 }
      )
    }
    if (!role?.trim() || role.trim().length > 100) {
      return NextResponse.json(
        { error: 'Função não informada.' },
        { status: 400 }
      )
    }

    const supabase = await createAdminClient()

    // Busca a pesquisa ativa mais recente
    const { data: survey } = await supabase
      .from('surveys')
      .select('id')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!survey) {
      return NextResponse.json(
        { error: 'Nenhuma pesquisa ativa no momento. Avise o organizador.' },
        { status: 404 }
      )
    }

    // A4: validar código de acesso se configurado no servidor
    const serverCode = process.env.SURVEY_ACCESS_CODE
    if (serverCode) {
      if (!accessCode || accessCode.trim() !== serverCode.trim()) {
        return NextResponse.json(
          { error: 'Código de acesso incorreto. Verifique com o organizador.' },
          { status: 403 }
        )
      }
    }

    // Cria o registro do respondente
    const { data: respondent, error } = await supabase
      .from('respondents')
      .insert({
        survey_id: survey.id,
        name: name.trim(),
        role: role.trim(),
      })
      .select('id')
      .single()

    if (error || !respondent) {
      // M2: logar apenas campos controlados, nunca o objeto bruto
      console.error('[identify] DB error:', error?.code, error?.message)
      return NextResponse.json(
        { error: 'Erro ao registrar sua identificação. Tente novamente.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      respondent_id: respondent.id,
      survey_id: survey.id,
    })
  } catch (err) {
    console.error('[identify] Unexpected error:', err instanceof Error ? err.message : 'unknown')
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
