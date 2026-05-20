import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

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
