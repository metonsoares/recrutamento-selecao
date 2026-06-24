import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { requireMasterApi } from '@/lib/auth-guard'

/** Máscara de CPF (000.000.000-00) a partir dos dígitos. */
function maskCpf(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 11)
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createSupabaseServiceClient()

  const [
    { data: candidate },
    { data: applications },
    { data: notes },
  ] = await Promise.all([
    supabase.from('candidates').select('*').eq('id', id).single(),
    supabase
      .from('applications')
      .select('*, jobs(title)')
      .eq('candidate_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('admin_notes')
      .select('*')
      .eq('candidate_id', id)
      .order('created_at', { ascending: false }),
  ])

  if (!candidate) {
    return NextResponse.json({ error: 'Candidato não encontrado' }, { status: 404 })
  }

  const latestApp = applications?.[0] ?? null

  const [{ data: formAnswers }, { data: cultureAnswers }] = await Promise.all([
    latestApp
      ? supabase
          .from('form_answers')
          .select('*, form_questions(question_text, category)')
          .eq('application_id', latestApp.id)
      : { data: [] },
    latestApp
      ? supabase
          .from('culture_answers')
          .select('*, culture_questions(question_text, culture_value)')
          .eq('application_id', latestApp.id)
      : { data: [] },
  ])

  return NextResponse.json({
    candidate,
    applications: applications ?? [],
    latestApp,
    formAnswers: formAnswers ?? [],
    cultureAnswers: cultureAnswers ?? [],
    notes: notes ?? [],
  })
}

/**
 * PATCH /api/admin/candidatos/[id]
 * Atualiza dados de contato do candidato (telefone/e-mail). Apenas Master.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireMasterApi()
    if (denied) return denied

    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const update: Record<string, unknown> = {}

    if (typeof body.phone === 'string') {
      const phone = body.phone.trim()
      update.phone = phone || null
      update.phone_normalized = phone.replace(/\D/g, '') || null
    }
    if (typeof body.email === 'string') {
      const email = body.email.trim().toLowerCase()
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 })
      }
      update.email = email || null
    }
    if (typeof body.cnpj === 'string') {
      const cnpj = body.cnpj.trim()
      if (cnpj && cnpj.replace(/\D/g, '').length !== 14) {
        return NextResponse.json({ error: 'CNPJ inválido (precisa ter 14 dígitos).' }, { status: 400 })
      }
      update.cnpj = cnpj || null
    }
    // CPF — valida 11 dígitos; guarda a versão mascarada p/ sincronizar a resposta do formulário
    let cpfMaskedSync: string | null | undefined = undefined
    if (typeof body.cpf === 'string') {
      const digits = body.cpf.replace(/\D/g, '')
      if (digits && digits.length !== 11) {
        return NextResponse.json({ error: 'CPF inválido (precisa ter 11 dígitos).' }, { status: 400 })
      }
      update.cpf = digits || null
      cpfMaskedSync = digits ? maskCpf(digits) : null
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 })
    }
    update.updated_at = new Date().toISOString()

    const service = await createSupabaseServiceClient()
    const { error } = await service.from('candidates').update(update).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // CPF é exibido na ficha a partir da resposta do formulário — mantém em sincronia.
    if (cpfMaskedSync !== undefined) {
      const { data: cand } = await service
        .from('candidates').select('latest_application_id').eq('id', id).single()
      const appId = cand?.latest_application_id as string | null | undefined
      if (appId) {
        const { data: q } = await service
          .from('form_questions').select('id').eq('field_type', 'cpf').limit(1).maybeSingle()
        if (q?.id) {
          await service.from('form_answers')
            .update({ answer_text: JSON.stringify(cpfMaskedSync ?? '') })
            .eq('application_id', appId).eq('question_id', q.id)
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[candidate PATCH]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/candidatos/[id]
 * Hard-deletes the candidate and ALL related records (applications, answers, notes, etc.)
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // Auth check
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const service = await createSupabaseServiceClient()

  // 1. Get all application IDs for cascade delete
  const { data: apps } = await service
    .from('applications')
    .select('id')
    .eq('candidate_id', id)

  const appIds = (apps || []).map(a => a.id as string)

  // 2. Delete all answers linked to those applications
  if (appIds.length > 0) {
    await Promise.all([
      service.from('culture_answers').delete().in('application_id', appIds),
      service.from('form_answers').delete().in('application_id', appIds),
    ])
  }

  // 3. Delete applications
  await service.from('applications').delete().eq('candidate_id', id)

  // 4. Delete admin notes
  await service.from('admin_notes').delete().eq('candidate_id', id)

  // 5. Delete whatsapp conversations linked to this candidate
  await service.from('whatsapp_conversations').delete().eq('candidate_id', id)

  // 6. Hard-delete the candidate record itself
  const { error } = await service.from('candidates').delete().eq('id', id)

  if (error) {
    console.error('[hard-delete candidate]', error)
    return NextResponse.json({ error: 'Erro ao remover candidato.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
