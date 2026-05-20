import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { normalizePhone, normalizeEmail, generateToken } from '@/lib/helpers'

interface CurriculoPayload {
  full_name: string
  phone: string
  email?: string
  city: string
  neighborhood?: string
  job_id?: string
  lgpd_accepted: boolean
  answers: Record<string, string | string[]>
}

export async function POST(req: NextRequest) {
  try {
    const body: CurriculoPayload = await req.json()
    const { full_name, phone, email, city, neighborhood, job_id, lgpd_accepted, answers } = body

    if (!full_name?.trim()) return NextResponse.json({ error: 'Nome completo é obrigatório.' }, { status: 400 })
    if (!phone?.trim()) return NextResponse.json({ error: 'Telefone é obrigatório.' }, { status: 400 })
    if (!city?.trim()) return NextResponse.json({ error: 'Cidade é obrigatória.' }, { status: 400 })
    if (!lgpd_accepted) return NextResponse.json({ error: 'Aceite dos termos LGPD é obrigatório.' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()

    const phoneNormalized = normalizePhone(phone)
    const emailNormalized = email ? normalizeEmail(email) : null

    const ipAddress =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      null

    // ── Verificar se telefone já existe (unique constraint) ───────────────────
    const { data: existingCandidate } = await supabase
      .from('candidates')
      .select('id')
      .eq('phone_normalized', phoneNormalized)
      .is('deleted_at', null)
      .maybeSingle()

    let candidateId: string

    if (existingCandidate) {
      // ── Telefone já cadastrado: atualiza os dados do candidato existente ────
      candidateId = existingCandidate.id

      await supabase
        .from('candidates')
        .update({
          full_name: full_name.trim(),
          phone: phone.trim(),
          email: email?.trim() || null,
          email_normalized: emailNormalized,
          city: city.trim(),
          neighborhood: neighborhood?.trim() || null,
          possible_duplicate: true,
          lgpd_accepted: true,
          lgpd_accepted_at: new Date().toISOString(),
          ip_address: ipAddress,
          updated_at: new Date().toISOString(),
        })
        .eq('id', candidateId)

      // Marca candidaturas anteriores como não-latest
      await supabase
        .from('applications')
        .update({ is_latest: false, updated_at: new Date().toISOString() })
        .eq('candidate_id', candidateId)
        .eq('is_latest', true)

    } else {
      // ── Telefone novo: insere candidato ─────────────────────────────────────
      const { data: newCandidate, error: candidateError } = await supabase
        .from('candidates')
        .insert({
          full_name: full_name.trim(),
          phone: phone.trim(),
          phone_normalized: phoneNormalized,
          email: email?.trim() || null,
          email_normalized: emailNormalized,
          city: city.trim(),
          neighborhood: neighborhood?.trim() || null,
          source: 'curriculo',
          lgpd_accepted: true,
          lgpd_accepted_at: new Date().toISOString(),
          possible_duplicate: false,
          ip_address: ipAddress,
        })
        .select('id')
        .single()

      if (candidateError || !newCandidate) {
        console.error('Error inserting candidate:', candidateError)
        return NextResponse.json({ error: 'Erro ao salvar candidato.' }, { status: 500 })
      }

      candidateId = newCandidate.id
    }

    // ── Gerar token do teste cultural (válido 24h) ────────────────────────────
    const cultureToken = generateToken()
    const cultureTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    // ── Inserir nova candidatura ──────────────────────────────────────────────
    const { data: newApplication, error: applicationError } = await supabase
      .from('applications')
      .insert({
        candidate_id: candidateId,
        job_id: job_id || null,
        status: 'aguardando_teste_cultural',
        source: 'curriculo',
        is_latest: true,
        culture_test_token: cultureToken,
        culture_test_token_expires_at: cultureTokenExpiresAt,
      })
      .select('id')
      .single()

    if (applicationError || !newApplication) {
      console.error('Error inserting application:', applicationError)
      return NextResponse.json({ error: 'Erro ao salvar candidatura.' }, { status: 500 })
    }

    // Atualiza latest_application_id no candidato
    await supabase
      .from('candidates')
      .update({ latest_application_id: newApplication.id, updated_at: new Date().toISOString() })
      .eq('id', candidateId)

    // ── Salvar respostas do formulário ────────────────────────────────────────
    if (answers && Object.keys(answers).length > 0) {
      const answerRows = Object.entries(answers)
        .filter(([, value]) => {
          if (Array.isArray(value)) return value.length > 0
          return value !== '' && value !== undefined && value !== null
        })
        .map(([question_id, value]) => ({
          application_id: newApplication.id,
          question_id,
          answer_text: JSON.stringify(value),
        }))

      if (answerRows.length > 0) {
        const { error: answersError } = await supabase.from('form_answers').insert(answerRows)
        if (answersError) console.error('Error inserting form answers:', answersError)
      }
    }

    return NextResponse.json({ success: true, token: cultureToken })
  } catch (err) {
    console.error('Curriculo route error:', err)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}
