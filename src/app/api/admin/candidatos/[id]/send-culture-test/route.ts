import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { generateToken } from '@/lib/helpers'
import { enviarWhatsApp, primeiroNome, TEMPLATE_TESTE_CULTURA } from '@/lib/whatsapp'

/**
 * POST /api/admin/candidatos/[id]/send-culture-test
 * - Gera token do teste cultural (7 dias)
 * - Atualiza status da candidatura para 'aguardando_teste_cultural'
 * - Envia o link pelo WhatsApp oficial do Portal BDT (modelo aprovado)
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // Auth
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const service = await createSupabaseServiceClient()

  // Fetch candidate
  const { data: candidate } = await service
    .from('candidates')
    .select('id, full_name, phone, phone_normalized')
    .eq('id', id)
    .single()
  if (!candidate) return NextResponse.json({ error: 'Candidato não encontrado.' }, { status: 404 })

  // Fetch latest application (with job title)
  const { data: app } = await service
    .from('applications')
    .select('id, job_id, jobs(title)')
    .eq('candidate_id', id)
    .eq('is_latest', true)
    .maybeSingle()
  if (!app) return NextResponse.json({ error: 'Nenhuma candidatura encontrada.' }, { status: 404 })

  // Resolve job title (can be in jobs join or need UUID lookup via form_answer)
  let jobTitle = (app.jobs as { title?: string } | null)?.title ?? null
  if (!jobTitle && app.job_id) {
    const { data: jobRow } = await service
      .from('jobs').select('title').eq('id', app.job_id).single()
    jobTitle = jobRow?.title ?? null
  }
  if (!jobTitle) jobTitle = 'nossa seleção de colaboradores'

  // Generate token — valid 7 days
  const token = generateToken()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { error: updateErr } = await service.from('applications').update({
    culture_test_token: token,
    culture_test_token_expires_at: expiresAt,
    status: 'aguardando_teste_cultural',
    updated_at: new Date().toISOString(),
  }).eq('id', app.id)

  if (updateErr) {
    console.error('[send-culture-test] DB update error:', updateErr)
    return NextResponse.json({ error: 'Erro ao gerar token.' }, { status: 500 })
  }

  // Culture test URL
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  const testUrl = `${appUrl}/candidato/teste-cultural?token=${token}`

  // ── WhatsApp pelo número oficial do Portal BDT ───────────────────────────
  // A Meta só deixa iniciar conversa com modelo aprovado. O modelo do teste
  // cultural ainda não existe: enquanto não for aprovado, o link continua
  // sendo gerado (a tela mostra e copia) e o envio volta com o motivo.
  let whatsappSent = false
  let whatsappError: string | null = null
  const rawPhone = candidate.phone || candidate.phone_normalized

  if (rawPhone) {
    const envio = await enviarWhatsApp({
      numero: rawPhone as string,
      template: TEMPLATE_TESTE_CULTURA,
      variaveis: [primeiroNome(candidate.full_name as string), jobTitle, testUrl],
      nome: candidate.full_name as string,
      referencia: candidate.id as string,
      acao: 'send_culture_test',
    })
    whatsappSent = envio.ok
    whatsappError = envio.ok ? null : (envio.erro ?? 'Não foi possível enviar pelo WhatsApp.')
  }

  return NextResponse.json({ ok: true, whatsappSent, whatsappError, testUrl })
}
