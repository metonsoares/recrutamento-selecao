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

    // Validate required fields
    if (!full_name?.trim()) {
      return NextResponse.json({ error: 'Nome completo é obrigatório.' }, { status: 400 })
    }
    if (!phone?.trim()) {
      return NextResponse.json({ error: 'Telefone é obrigatório.' }, { status: 400 })
    }
    if (!city?.trim()) {
      return NextResponse.json({ error: 'Cidade é obrigatória.' }, { status: 400 })
    }
    if (!lgpd_accepted) {
      return NextResponse.json({ error: 'Aceite dos termos LGPD é obrigatório.' }, { status: 400 })
    }

    const supabase = await createSupabaseServiceClient()

    // Normalize contact data
    const phoneNormalized = normalizePhone(phone)
    const emailNormalized = email ? normalizeEmail(email) : null

    // Check for duplicate by normalized phone
    const { data: existingCandidate } = await supabase
      .from('candidates')
      .select('id, latest_application_id')
      .eq('phone_normalized', phoneNormalized)
      .is('deleted_at', null)
      .maybeSingle()

    let possibleDuplicate = false

    if (existingCandidate) {
      possibleDuplicate = true
      // Mark existing candidate as possible duplicate
      await supabase
        .from('candidates')
        .update({ possible_duplicate: true, updated_at: new Date().toISOString() })
        .eq('id', existingCandidate.id)

      // Mark previous applications as not latest
      await supabase
        .from('applications')
        .update({ is_latest: false, updated_at: new Date().toISOString() })
        .eq('candidate_id', existingCandidate.id)
        .eq('is_latest', true)
    }

    // Capture client IP address
    const ipAddress =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      null

    // Insert new candidate
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
        possible_duplicate: possibleDuplicate,
        ip_address: ipAddress,
      })
      .select('id')
      .single()

    if (candidateError || !newCandidate) {
      console.error('Error inserting candidate:', candidateError)
      return NextResponse.json({ error: 'Erro ao salvar candidato.' }, { status: 500 })
    }

    // Generate culture test token (valid 24h — candidate completes inline right after)
    const cultureToken = generateToken()
    const cultureTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    // Insert new application
    const { data: newApplication, error: applicationError } = await supabase
      .from('applications')
      .insert({
        candidate_id: newCandidate.id,
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

    // Update candidate with latest_application_id
    await supabase
      .from('candidates')
      .update({
        latest_application_id: newApplication.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', newCandidate.id)

    // Insert form answers if any
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
        const { error: answersError } = await supabase
          .from('form_answers')
          .insert(answerRows)

        if (answersError) {
          console.error('Error inserting form answers:', answersError)
          // Non-fatal: candidate and application were saved, just log the error
        }
      }
    }

    return NextResponse.json({ success: true, token: cultureToken })
  } catch (err) {
    console.error('Curriculo route error:', err)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}
