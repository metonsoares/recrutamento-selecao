import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import AdminHeader from '../../AdminHeader'
import type { QuestionType } from '@/lib/types/database'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function RespondentDetailPage({ params }: PageProps) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const admin = await createAdminClient()

  // Respondente
  const { data: respondent } = await admin
    .from('respondents')
    .select('id, name, role, created_at, survey_id')
    .eq('id', id)
    .maybeSingle()

  if (!respondent) notFound()

  // Response (se existir)
  const { data: response } = await admin
    .from('responses')
    .select('id, submitted_at')
    .eq('respondent_id', id)
    .maybeSingle()

  // Respostas com contexto de pergunta e opção
  let groupedAnswers: SectionGroup[] = []

  if (response) {
    const { data: answersRaw } = await admin
      .from('answers')
      .select(`
        question_id, option_id, answer_text, answer_number,
        questions!inner(
          question_text, question_type, display_order,
          survey_sections!inner(title, display_order)
        ),
        question_options(option_text)
      `)
      .eq('response_id', response.id)

    groupedAnswers = buildSectionGroups(answersRaw ?? [])
  }

  return (
    <div className="min-h-screen bg-muted">
      <AdminHeader userEmail={user.email ?? ''} />

      <div className="max-w-3xl mx-auto px-5 py-6 space-y-5">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/admin/respondentes" className="hover:text-foreground transition-colors">
            Respondentes
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">{respondent.name}</span>
        </div>

        {/* Card do respondente */}
        <div className="bg-white rounded-2xl border border-border p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-bold text-foreground">{respondent.name}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{respondent.role}</p>
            </div>
            <div className="text-right text-xs text-muted-foreground space-y-1">
              <p>
                Entrou:{' '}
                {new Date(respondent.created_at).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
              {response ? (
                <p className="text-green-600 font-medium">
                  Enviou:{' '}
                  {new Date(response.submitted_at).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              ) : (
                <p className="text-amber-600 font-medium">Não enviou a pesquisa</p>
              )}
            </div>
          </div>
        </div>

        {/* Respostas */}
        {!response ? (
          <div className="bg-white rounded-2xl border border-border p-8 text-center shadow-sm">
            <p className="text-muted-foreground text-sm">
              Este respondente não concluiu o envio da pesquisa.
            </p>
          </div>
        ) : groupedAnswers.length === 0 ? (
          <div className="bg-white rounded-2xl border border-border p-8 text-center shadow-sm">
            <p className="text-muted-foreground text-sm">
              Nenhuma resposta registrada.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {groupedAnswers.map((section) => (
              <div key={section.title} className="space-y-3">
                <h2 className="text-xs font-bold text-foreground uppercase tracking-wide px-1 border-b border-border pb-1.5">
                  {section.title}
                </h2>
                <div className="space-y-2">
                  {section.questions.map((q) => (
                    <AnswerCard key={q.questionId} question={q} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tipos locais ─────────────────────────────────────────────────────────────

interface QuestionAnswer {
  questionId: string
  questionText: string
  questionType: QuestionType
  displayOrder: number
  selectedOptions: string[]
  answerText: string | null
  answerNumber: number | null
}

interface SectionGroup {
  title: string
  order: number
  questions: QuestionAnswer[]
}

// ─── Agrupamento de respostas por seção ───────────────────────────────────────

function buildSectionGroups(answersRaw: RawAnswer[]): SectionGroup[] {
  const sectionMap = new Map<string, SectionGroup>()

  for (const row of answersRaw) {
    const q = row.questions as unknown as {
      question_text: string
      question_type: string
      display_order: number
      survey_sections: { title: string; display_order: number }
    }
    const opt = row.question_options as unknown as { option_text: string } | null
    const sectionTitle = q.survey_sections.title
    const sectionOrder = q.survey_sections.display_order

    if (!sectionMap.has(sectionTitle)) {
      sectionMap.set(sectionTitle, {
        title: sectionTitle,
        order: sectionOrder,
        questions: [],
      })
    }

    const section = sectionMap.get(sectionTitle)!
    let existing = section.questions.find((qa) => qa.questionId === row.question_id)

    if (!existing) {
      existing = {
        questionId: row.question_id,
        questionText: q.question_text,
        questionType: q.question_type as QuestionType,
        displayOrder: q.display_order,
        selectedOptions: [],
        answerText: null,
        answerNumber: null,
      }
      section.questions.push(existing)
    }

    if (opt?.option_text) {
      existing.selectedOptions.push(opt.option_text)
    }
    if (row.answer_text) existing.answerText = row.answer_text
    if (row.answer_number != null) existing.answerNumber = Number(row.answer_number)
  }

  return [...sectionMap.values()]
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      ...s,
      questions: s.questions.sort((a, b) => a.displayOrder - b.displayOrder),
    }))
}

interface RawAnswer {
  question_id: string
  option_id: string | null
  answer_text: string | null
  answer_number: number | null
  questions: unknown
  question_options: unknown
}

// ─── Card de resposta individual ──────────────────────────────────────────────

function AnswerCard({ question }: { question: QuestionAnswer }) {
  return (
    <div className="bg-white rounded-xl border border-border p-4 shadow-sm">
      <p className="text-sm font-medium text-foreground leading-snug mb-2">
        {question.questionText}
      </p>
      <AnswerDisplay question={question} />
    </div>
  )
}

function AnswerDisplay({ question }: { question: QuestionAnswer }) {
  // Nenhuma resposta registrada
  const hasAnswer =
    question.selectedOptions.length > 0 ||
    question.answerText ||
    question.answerNumber != null

  if (!hasAnswer) {
    return <p className="text-xs text-muted-foreground italic">Não respondida</p>
  }

  if (question.questionType === 'open_text') {
    return (
      <p className="text-sm text-foreground bg-muted/40 rounded-lg px-3 py-2.5 leading-relaxed">
        {question.answerText}
      </p>
    )
  }

  if (question.questionType === 'number') {
    return (
      <span className="inline-block text-xl font-bold text-primary">
        {question.answerNumber}
      </span>
    )
  }

  if (question.questionType === 'scale') {
    return (
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold text-primary tabular-nums">
          {question.answerNumber}
        </span>
        {question.selectedOptions[0] && (
          <span className="text-sm text-muted-foreground">
            — {question.selectedOptions[0].replace(/^\d+\s*[–-]\s*/, '')}
          </span>
        )}
      </div>
    )
  }

  // single_choice, multiple_choice
  return (
    <div className="flex flex-wrap gap-1.5">
      {question.selectedOptions.map((opt, i) => (
        <span
          key={i}
          className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium"
        >
          {opt}
        </span>
      ))}
    </div>
  )
}
