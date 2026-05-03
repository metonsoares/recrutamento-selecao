import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import AdminHeader from '../AdminHeader'
import DashboardCharts, {
  type ChartQuestion,
  type AnswerRecord,
} from './DashboardCharts'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  // Auth
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const admin = await createAdminClient()

  // ─── Survey ativa ──────────────────────────────────────────────────────────
  const { data: survey } = await admin
    .from('surveys')
    .select('id, title, status, created_at')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // ─── Stats gerais ──────────────────────────────────────────────────────────
  const [{ count: totalRespondents }, { count: submittedCount }] =
    await Promise.all([
      admin
        .from('respondents')
        .select('*', { count: 'exact', head: true })
        .eq('survey_id', survey?.id ?? ''),
      admin
        .from('responses')
        .select('*', { count: 'exact', head: true })
        .eq('survey_id', survey?.id ?? ''),
    ])

  // ─── Respondentes por função ───────────────────────────────────────────────
  const { data: respondentsData } = await admin
    .from('respondents')
    .select('role')
    .eq('survey_id', survey?.id ?? '')

  const roleCounts: Record<string, number> = {}
  for (const r of respondentsData ?? []) {
    roleCounts[r.role] = (roleCounts[r.role] ?? 0) + 1
  }
  const topRoles = Object.entries(roleCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)

  if (!survey) {
    return (
      <div className="min-h-screen bg-muted">
        <AdminHeader userEmail={user.email ?? ''} />
        <div className="max-w-6xl mx-auto px-5 py-16 text-center">
          <p className="text-muted-foreground text-sm">
            Nenhuma pesquisa ativa no momento.
          </p>
        </div>
      </div>
    )
  }

  // ─── Perguntas com opções ──────────────────────────────────────────────────
  const { data: questionsRaw } = await admin
    .from('questions')
    .select(`
      id, question_text, question_type, display_order, section_id,
      survey_sections!inner(title, display_order),
      question_options(id, option_text, display_order)
    `)
    .eq('survey_id', survey.id)
    .order('display_order')

  const questions: ChartQuestion[] = (questionsRaw ?? []).map((q) => {
    const section = q.survey_sections as unknown as {
      title: string
      display_order: number
    }
    return {
      id: q.id,
      text: q.question_text,
      type: q.question_type as ChartQuestion['type'],
      section: section.title,
      sectionOrder: section.display_order,
      displayOrder: q.display_order,
      options: (q.question_options ?? [])
        .sort((a, b) => a.display_order - b.display_order)
        .map((o) => ({ id: o.id, text: o.option_text, order: o.display_order })),
    }
  })

  const questionIds = questions.map((q) => q.id)

  // ─── Respostas com função do respondente ───────────────────────────────────
  let answers: AnswerRecord[] = []

  if (questionIds.length > 0) {
    const { data: answersRaw } = await admin
      .from('answers')
      .select(`
        question_id,
        option_id,
        answer_text,
        answer_number,
        response_id,
        responses!inner(respondent_id, respondents!inner(role))
      `)
      .in('question_id', questionIds)

    answers = (answersRaw ?? []).map((a) => {
      const resp = a.responses as unknown as {
        respondent_id: string
        respondents: { role: string }
      }
      return {
        questionId: a.question_id,
        responseId: a.response_id,
        optionId: a.option_id,
        answerText: a.answer_text,
        answerNumber: a.answer_number ? Number(a.answer_number) : null,
        role: resp.respondents.role,
      }
    })
  }

  const roles = [...new Set(answers.map((a) => a.role))].sort()

  // ─── Últimos respondentes ──────────────────────────────────────────────────
  const { data: recentRaw } = await admin
    .from('respondents')
    .select('id, name, role, created_at')
    .eq('survey_id', survey.id)
    .order('created_at', { ascending: false })
    .limit(5)

  const recent = recentRaw ?? []

  return (
    <div className="min-h-screen bg-muted">
      <AdminHeader userEmail={user.email ?? ''} />

      <div className="max-w-6xl mx-auto px-5 py-6 space-y-6">
        {/* ─── Stats cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Total identificado"
            value={totalRespondents ?? 0}
            sub="pessoas registradas"
          />
          <StatCard
            label="Enviaram"
            value={submittedCount ?? 0}
            sub={`${totalRespondents ? Math.round(((submittedCount ?? 0) / totalRespondents) * 100) : 0}% de conclusão`}
            highlight
          />
          <StatCard
            label="Pesquisa"
            value={survey.status === 'active' ? 'Ativa' : 'Encerrada'}
            sub={new Date(survey.created_at).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })}
          />
          <StatCard
            label="Funções distintas"
            value={topRoles.length}
            sub="cargos representados"
          />
        </div>

        {/* ─── Breakdown por função + últimos respondentes ───────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Funções */}
          <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">
                Respostas por função
              </h2>
              <Link
                href="/admin/respondentes"
                className="text-xs text-primary hover:underline"
              >
                Ver todos →
              </Link>
            </div>
            {topRoles.length > 0 ? (
              <div className="divide-y divide-border">
                {topRoles.map(([role, count]) => (
                  <div
                    key={role}
                    className="px-5 py-2.5 flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{role}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-1.5 rounded-full bg-primary/40"
                        style={{
                          width: `${Math.round(
                            (count / Math.max(...topRoles.map((r) => r[1]))) * 80
                          )}px`,
                        }}
                      />
                      <span className="text-sm font-semibold text-primary tabular-nums w-5 text-right">
                        {count}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-5 py-6 text-sm text-muted-foreground text-center">
                Nenhuma resposta ainda.
              </p>
            )}
          </div>

          {/* Últimos */}
          <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">
                Últimas identificações
              </h2>
              <Link
                href="/admin/respondentes"
                className="text-xs text-primary hover:underline"
              >
                Ver todos →
              </Link>
            </div>
            {recent.length > 0 ? (
              <div className="divide-y divide-border">
                {recent.map((r) => (
                  <Link
                    key={r.id}
                    href={`/admin/respondentes/${r.id}`}
                    className="flex items-center justify-between px-5 py-2.5 hover:bg-muted/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {r.name}
                      </p>
                      <p className="text-xs text-muted-foreground">{r.role}</p>
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                      {new Date(r.created_at).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="px-5 py-6 text-sm text-muted-foreground text-center">
                Nenhuma resposta ainda.
              </p>
            )}
          </div>
        </div>

        {/* ─── Gráficos ─────────────────────────────────────────────────────── */}
        {answers.length > 0 ? (
          <DashboardCharts
            questions={questions}
            answers={answers}
            roles={roles}
            totalRespondents={totalRespondents ?? 0}
            submittedCount={submittedCount ?? 0}
          />
        ) : (
          <div className="bg-white rounded-2xl border border-border p-8 text-center shadow-sm">
            <p className="text-muted-foreground text-sm">
              Os gráficos aparecerão aqui após as primeiras respostas serem enviadas.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string
  value: string | number
  sub: string
  highlight?: boolean
}) {
  return (
    <div
      className={[
        'rounded-2xl border p-4 shadow-sm',
        highlight ? 'bg-primary text-primary-foreground border-primary' : 'bg-white border-border',
      ].join(' ')}
    >
      <p
        className={[
          'text-xs font-semibold uppercase tracking-wide',
          highlight ? 'opacity-80' : 'text-muted-foreground',
        ].join(' ')}
      >
        {label}
      </p>
      <p
        className={[
          'text-3xl font-bold mt-1.5 tabular-nums',
          highlight ? '' : 'text-primary',
        ].join(' ')}
      >
        {value}
      </p>
      <p
        className={[
          'text-xs mt-0.5',
          highlight ? 'opacity-70' : 'text-muted-foreground',
        ].join(' ')}
      >
        {sub}
      </p>
    </div>
  )
}
