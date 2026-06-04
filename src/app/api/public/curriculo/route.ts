import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { normalizePhone, normalizeEmail, generateToken } from '@/lib/helpers'

interface CurriculoPayload {
  full_name: string
  phone: string
  email?: string
  city?: string
  neighborhood?: string
  cpf?: string
  job_id?: string
  lgpd_accepted: boolean
  answers: Record<string, string | string[]>
}

/** Normaliza CPF removendo máscara para comparação */
function normalizeCPF(cpf: string): string {
  return cpf.replace(/\D/g, '')
}

/** Compara campos e retorna apenas os que mudaram */
function computeDiff(
  oldData: Record<string, string>,
  newData: Record<string, string>,
): Record<string, { old: string; new: string }> {
  const diff: Record<string, { old: string; new: string }> = {}
  for (const key of Object.keys(newData)) {
    const oldVal = (oldData[key] || '').trim()
    const newVal = (newData[key] || '').trim()
    if (oldVal && newVal && oldVal !== newVal) {
      diff[key] = { old: oldVal, new: newVal }
    }
  }
  return diff
}

export async function POST(req: NextRequest) {
  try {
    const body: CurriculoPayload = await req.json()
    const { full_name, phone, email, city, neighborhood, cpf, job_id, lgpd_accepted, answers } = body

    if (!full_name?.trim()) return NextResponse.json({ error: 'Nome completo é obrigatório.' }, { status: 400 })
    if (!phone?.trim()) return NextResponse.json({ error: 'Telefone é obrigatório.' }, { status: 400 })
    if (!lgpd_accepted) return NextResponse.json({ error: 'Aceite dos termos LGPD é obrigatório.' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()

    const phoneNormalized = normalizePhone(phone)
    const emailNormalized = email ? normalizeEmail(email) : null
    const cpfNormalized = cpf ? normalizeCPF(cpf) : null

    const ipAddress =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      null

    // ── Buscar candidato existente — prioridade: CPF > telefone ──────────────
    // Busca em duas passagens: primeiro ativos, depois soft-deleted.
    // Isso permite reativar candidatos que foram "removidos" (deleted_at preenchido)
    // sem gerar erro de constraint ao tentar inserir um registro duplicado.
    type CandidateRow = { id: string; full_name: string; phone: string | null; email: string | null; city: string | null }
    let existingCandidate: CandidateRow | null = null
    let wasDeleted = false

    // Passagem 1: candidatos ATIVOS (deleted_at IS NULL)
    if (cpfNormalized) {
      const { data } = await supabase
        .from('candidates')
        .select('id, full_name, phone, email, city')
        .eq('cpf', cpfNormalized)
        .is('deleted_at', null)
        .maybeSingle()
      existingCandidate = data
    }
    if (!existingCandidate) {
      const { data } = await supabase
        .from('candidates')
        .select('id, full_name, phone, email, city')
        .eq('phone_normalized', phoneNormalized)
        .is('deleted_at', null)
        .maybeSingle()
      existingCandidate = data
    }

    // Passagem 2: candidatos SOFT-DELETED (deleted_at IS NOT NULL)
    // Permite reativar quem teve a ficha removida via soft-delete
    if (!existingCandidate) {
      if (cpfNormalized) {
        const { data } = await supabase
          .from('candidates')
          .select('id, full_name, phone, email, city')
          .eq('cpf', cpfNormalized)
          .not('deleted_at', 'is', null)
          .maybeSingle()
        if (data) { existingCandidate = data; wasDeleted = true }
      }
      if (!existingCandidate) {
        const { data } = await supabase
          .from('candidates')
          .select('id, full_name, phone, email, city')
          .eq('phone_normalized', phoneNormalized)
          .not('deleted_at', 'is', null)
          .maybeSingle()
        if (data) { existingCandidate = data; wasDeleted = true }
      }
    }

    // ── Libera phone_normalized preso em registros SOFT-DELETED ───────────────
    // O índice único de phone_normalized inclui registros removidos. Sem liberar,
    // a inserção/atualização com um telefone "preso" por outro candidato removido
    // falha por conflito de constraint. Só mexe em registros soft-deleted.
    if (phoneNormalized) {
      let freeQ = supabase
        .from('candidates')
        .update({ phone_normalized: null, updated_at: new Date().toISOString() })
        .eq('phone_normalized', phoneNormalized)
        .not('deleted_at', 'is', null)
      if (existingCandidate) freeQ = freeQ.neq('id', existingCandidate.id)
      await freeQ
    }

    let candidateId: string

    if (existingCandidate) {
      // ── Candidato já existe (ou foi reativado): detecta alterações e atualiza
      candidateId = existingCandidate.id

      // Computa diff dos campos principais (apenas para candidatos não-reativados)
      const diff = wasDeleted ? {} : computeDiff(
        {
          Nome: existingCandidate.full_name || '',
          Telefone: existingCandidate.phone || '',
          'E-mail': existingCandidate.email || '',
          Cidade: existingCandidate.city || '',
        },
        {
          Nome: full_name.trim(),
          Telefone: phone.trim(),
          'E-mail': email?.trim() || '',
          Cidade: city?.trim() || '',
        },
      )

      const { error: updateError } = await supabase
        .from('candidates')
        .update({
          full_name: full_name.trim(),
          phone: phone.trim(),
          phone_normalized: phoneNormalized,
          email: email?.trim() || null,
          email_normalized: emailNormalized,
          city: city?.trim() || null,
          neighborhood: neighborhood?.trim() || null,
          cpf: cpfNormalized || undefined,
          possible_duplicate: !wasDeleted, // reativação não é duplicata
          deleted_at: null,                // reativa candidatos soft-deleted
          // Marca que o candidato já havia sido cadastrado antes (reativado)
          ...(wasDeleted ? { previously_registered: true } : {}),
          lgpd_accepted: true,
          lgpd_accepted_at: new Date().toISOString(),
          ip_address: ipAddress,
          // Salva o diff apenas se houver mudanças reais
          ...(Object.keys(diff).length > 0
            ? { data_changes: diff, data_updated_at: new Date().toISOString() }
            : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', candidateId)

      if (updateError) {
        console.error('Error updating/reactivating candidate:', updateError)
        return NextResponse.json({ error: 'Erro ao atualizar candidato.' }, { status: 500 })
      }

      // Marca candidaturas anteriores como não-latest (inclusive de reativados)
      await supabase
        .from('applications')
        .update({ is_latest: false, updated_at: new Date().toISOString() })
        .eq('candidate_id', candidateId)
        .eq('is_latest', true)

    } else {
      // ── Novo candidato: insere ─────────────────────────────────────────────
      const { data: newCandidate, error: candidateError } = await supabase
        .from('candidates')
        .insert({
          full_name: full_name.trim(),
          phone: phone.trim(),
          phone_normalized: phoneNormalized,
          email: email?.trim() || null,
          email_normalized: emailNormalized,
          city: city?.trim() || null,
          neighborhood: neighborhood?.trim() || null,
          cpf: cpfNormalized || null,
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

    // Trigger AI analysis async (fire and forget) — analisa imediatamente ao receber o currículo
    fetch(`${process.env.APP_URL || 'http://localhost:3000'}/api/admin/ai/analyze-candidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId: newApplication.id }),
    }).catch(() => {})

    return NextResponse.json({ success: true, token: cultureToken })
  } catch (err) {
    console.error('Curriculo route error:', err)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}
