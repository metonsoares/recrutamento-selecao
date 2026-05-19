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
 * Soft-deletes the candidate (sets deleted_at). Requires authenticated admin session.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const service = await createSupabaseServiceClient()
  const { error } = await service
    .from('candidates')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    console.error('[delete candidate]', error)
    return NextResponse.json({ error: 'Erro ao remover candidato.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
