import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import { formatDateTime } from '@/lib/helpers'
import { PesquisaResultadoView } from './resultado-view'

export const dynamic = 'force-dynamic'

interface QOption { text: string; weight: number }
interface Question { id: string; text: string; type?: 'texto' | 'multipla'; options: QOption[] }

export default async function ResultadoPesquisaPage({ params }: { params: Promise<{ id: string; surveyId: string }> }) {
  const { id, surveyId } = await params
  const supabase = await createSupabaseServiceClient()

  const [{ data: candidate }, { data: survey }] = await Promise.all([
    supabase.from('candidates').select('full_name').eq('id', id).maybeSingle(),
    supabase.from('climate_surveys').select('title, company_name, questions').eq('id', surveyId).maybeSingle(),
  ])
  if (!candidate || !survey) notFound()

  const { data: response } = await supabase
    .from('climate_responses').select('*')
    .eq('survey_id', surveyId).eq('candidate_id', id)
    .order('created_at', { ascending: false })
    .maybeSingle()
  if (!response) notFound()

  const questions = (survey.questions as Question[]) || []
  const answers = (response.answers as Record<string, number | string>) || {}

  const rows = questions.map(q => {
    const a = answers[q.id]
    if (q.type === 'texto') return { question: q.text, answer: a ? String(a) : '(em branco)', isText: true }
    const idx = typeof a === 'number' ? a : Number(a)
    const opt = q.options?.[idx]
    return { question: q.text, answer: opt ? `${opt.text} (peso ${opt.weight})` : '(não respondida)', isText: false }
  })

  const pct = response.max_score ? Math.round(((response.total_score || 0) / response.max_score) * 100) : null

  return (
    <PesquisaResultadoView
      candidateId={id}
      surveyId={surveyId}
      responseId={response.id as string}
      candidateName={candidate.full_name as string}
      surveyTitle={survey.title as string}
      companyName={(survey.company_name as string | null) ?? null}
      filledAt={formatDateTime(response.created_at as string)}
      pct={pct}
      totalScore={(response.total_score as number | null) ?? null}
      maxScore={(response.max_score as number | null) ?? null}
      rows={rows}
      initialAnalysis={(response.ai_interpretation as string | null) ?? null}
    />
  )
}
