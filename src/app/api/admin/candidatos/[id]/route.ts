import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

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
