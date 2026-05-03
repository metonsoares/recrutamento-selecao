'use client'

import { useState, useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { QuestionType } from '@/lib/types/database'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ChartQuestion {
  id: string
  text: string
  type: QuestionType
  section: string
  sectionOrder: number
  displayOrder: number
  options: Array<{ id: string; text: string; order: number }>
}

export interface AnswerRecord {
  questionId: string
  responseId: string
  optionId: string | null
  answerText: string | null
  answerNumber: number | null
  role: string
}

interface Props {
  questions: ChartQuestion[]
  answers: AnswerRecord[]
  roles: string[]
  totalRespondents: number
  submittedCount: number
}

// ─── Paleta de cores da marca ─────────────────────────────────────────────────
const COLORS = {
  primary: '#516b51',
  primaryLight: '#7a9c6e',
  accent: '#c9a434',
  muted: '#e2e8df',
  scale: ['#a8c89a', '#7fad71', '#516b51', '#3d5240', '#2a3a2d'],
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function DashboardCharts({
  questions,
  answers,
  roles,
  totalRespondents,
  submittedCount,
}: Props) {
  const [selectedRole, setSelectedRole] = useState('')

  const filteredAnswers = useMemo(
    () =>
      selectedRole
        ? answers.filter((a) => a.role === selectedRole)
        : answers,
    [answers, selectedRole]
  )

  // Agrupa questões por seção
  const sections = useMemo(() => {
    const map = new Map<string, { order: number; questions: ChartQuestion[] }>()
    for (const q of questions) {
      if (!map.has(q.section)) {
        map.set(q.section, { order: q.sectionOrder, questions: [] })
      }
      map.get(q.section)!.questions.push(q)
    }
    return [...map.entries()]
      .sort((a, b) => a[1].order - b[1].order)
      .map(([title, v]) => ({
        title,
        questions: v.questions.sort((a, b) => a.displayOrder - b.displayOrder),
      }))
  }, [questions])

  // Contagem de respondentes que escolheram cada cargo no filtro
  const roleCount = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of roles) counts[r] = 0
    for (const a of answers) {
      if (a.optionId === null && a.answerText === null && a.answerNumber === null) continue
      // contar respostas únicas por responseId/role
    }
    // simpler: count unique responseIds per role
    const seen = new Map<string, string>()
    for (const a of answers) seen.set(a.responseId, a.role)
    for (const role of seen.values()) {
      counts[role] = (counts[role] ?? 0) + 1
    }
    return counts
  }, [answers, roles])

  const activeRespondents = selectedRole
    ? roleCount[selectedRole] ?? 0
    : submittedCount

  return (
    <div className="space-y-6">
      {/* ─── Filtro por função ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-border p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">
              Filtrar respostas por função
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {selectedRole
                ? `${activeRespondents} respondente${activeRespondents !== 1 ? 's' : ''} nesta função`
                : `Exibindo todos os ${submittedCount} respondentes`}
            </p>
          </div>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="h-10 px-3 rounded-xl border border-border bg-white text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">Todas as funções</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {r} ({roleCount[r] ?? 0})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ─── Gráficos por seção ─────────────────────────────────────────────── */}
      {sections.map((section) => (
        <div key={section.title} className="space-y-4">
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wide px-1 border-b border-border pb-2">
            {section.title}
          </h2>
          {section.questions.map((q) => (
            <QuestionChart
              key={q.id}
              question={q}
              answers={filteredAnswers.filter((a) => a.questionId === q.id)}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── Card de gráfico por pergunta ─────────────────────────────────────────────

function QuestionChart({
  question,
  answers,
}: {
  question: ChartQuestion
  answers: AnswerRecord[]
}) {
  if (question.type === 'open_text') {
    return <OpenTextCard question={question} answers={answers} />
  }
  if (question.type === 'number') {
    return <NumberCard question={question} answers={answers} />
  }
  if (question.type === 'scale') {
    return <ScaleCard question={question} answers={answers} />
  }
  // single_choice, multiple_choice
  return <ChoiceCard question={question} answers={answers} />
}

// ─── Escolha única / múltipla ─────────────────────────────────────────────────

function ChoiceCard({
  question,
  answers,
}: {
  question: ChartQuestion
  answers: AnswerRecord[]
}) {
  const uniqueRespondents = new Set(answers.map((a) => a.responseId)).size

  const data = question.options
    .sort((a, b) => a.order - b.order)
    .map((opt) => {
      const count = answers.filter((a) => a.optionId === opt.id).length
      const pct = uniqueRespondents > 0 ? Math.round((count / uniqueRespondents) * 100) : 0
      return { name: opt.text, count, pct }
    })
    .filter((d) => d.count > 0 || question.options.length <= 6)

  if (uniqueRespondents === 0) return <EmptyCard question={question} />

  const barHeight = Math.max(40, data.length * 44 + 20)

  return (
    <div className="bg-white rounded-2xl border border-border p-4 shadow-sm">
      <QuestionHeader question={question} count={uniqueRespondents} />
      <ResponsiveContainer width="100%" height={barHeight}>
        <BarChart
          layout="vertical"
          data={data}
          margin={{ top: 4, right: 48, bottom: 4, left: 4 }}
        >
          <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#f0f0ef" />
          <YAxis
            type="category"
            dataKey="name"
            width={180}
            tick={{ fontSize: 11, fill: '#6b7a6b' }}
            tickLine={false}
            axisLine={false}
          />
          <XAxis type="number" hide domain={[0, 'dataMax']} />
          <Tooltip
            formatter={(value, _name, props) => [
              `${value ?? 0} (${(props as { payload?: { pct?: number } }).payload?.pct ?? 0}%)`,
              'Respostas',
            ]}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={32}>
            {data.map((_, i) => (
              <Cell
                key={i}
                fill={i === 0 ? COLORS.primary : i === 1 ? COLORS.primaryLight : COLORS.accent}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Escala 1–5 ───────────────────────────────────────────────────────────────

function ScaleCard({
  question,
  answers,
}: {
  question: ChartQuestion
  answers: AnswerRecord[]
}) {
  const nums = answers
    .map((a) => a.answerNumber)
    .filter((n): n is number => n != null)

  if (nums.length === 0) return <EmptyCard question={question} />

  const avg = nums.reduce((s, n) => s + n, 0) / nums.length
  const maxVal = question.options.length || 5

  const data = Array.from({ length: maxVal }, (_, i) => ({
    value: i + 1,
    count: nums.filter((n) => n === i + 1).length,
    label: question.options[i]
      ? question.options[i].text.replace(/^\d+\s*[–-]\s*/, '')
      : String(i + 1),
  }))

  return (
    <div className="bg-white rounded-2xl border border-border p-4 shadow-sm">
      <QuestionHeader question={question} count={nums.length}>
        <span className="ml-2 text-xs font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded-full">
          Média: {avg.toFixed(1)}
        </span>
      </QuestionHeader>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 16, left: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f0f0ef" />
          <XAxis
            dataKey="value"
            tick={{ fontSize: 13, fontWeight: 600, fill: '#516b51' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis hide />
          <Tooltip
            formatter={(value, _name, props) => {
              const v = Number(value ?? 0)
              const lbl = (props as { payload?: { label?: string } }).payload?.label ?? ''
              return [`${v} resposta${v !== 1 ? 's' : ''}${lbl ? ` — ${lbl}` : ''}`, '']
            }}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={40}>
            {data.map((d, i) => (
              <Cell key={i} fill={COLORS.scale[i] ?? COLORS.primary} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {/* Labels das extremidades */}
      {question.options.length >= 2 && (
        <div className="flex justify-between text-xs text-muted-foreground px-2 -mt-2">
          <span className="max-w-[45%] leading-tight">
            {question.options[0].text.replace(/^\d+\s*[–-]\s*/, '')}
          </span>
          <span className="max-w-[45%] text-right leading-tight">
            {question.options[question.options.length - 1].text.replace(/^\d+\s*[–-]\s*/, '')}
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Texto aberto ─────────────────────────────────────────────────────────────

function OpenTextCard({
  question,
  answers,
}: {
  question: ChartQuestion
  answers: AnswerRecord[]
}) {
  const [expanded, setExpanded] = useState(false)
  const texts = answers
    .map((a) => a.answerText)
    .filter((t): t is string => !!t?.trim())

  if (texts.length === 0) return <EmptyCard question={question} />

  const visible = expanded ? texts : texts.slice(0, 3)

  return (
    <div className="bg-white rounded-2xl border border-border p-4 shadow-sm">
      <QuestionHeader question={question} count={texts.length} />
      <div className="space-y-2 mt-1">
        {visible.map((text, i) => (
          <div
            key={i}
            className="text-sm text-foreground bg-muted/40 rounded-xl px-3 py-2.5 leading-relaxed"
          >
            {text}
          </div>
        ))}
      </div>
      {texts.length > 3 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 text-xs text-primary font-medium hover:underline"
        >
          {expanded ? 'Ver menos' : `Ver mais ${texts.length - 3} resposta${texts.length - 3 !== 1 ? 's' : ''}`}
        </button>
      )}
    </div>
  )
}

// ─── Número ───────────────────────────────────────────────────────────────────

function NumberCard({
  question,
  answers,
}: {
  question: ChartQuestion
  answers: AnswerRecord[]
}) {
  const nums = answers
    .map((a) => a.answerNumber)
    .filter((n): n is number => n != null)

  if (nums.length === 0) return <EmptyCard question={question} />

  const avg = nums.reduce((s, n) => s + n, 0) / nums.length
  const min = Math.min(...nums)
  const max = Math.max(...nums)

  return (
    <div className="bg-white rounded-2xl border border-border p-4 shadow-sm">
      <QuestionHeader question={question} count={nums.length} />
      <div className="grid grid-cols-3 gap-3 mt-2">
        {[
          { label: 'Média', value: avg.toFixed(1) },
          { label: 'Mínimo', value: String(min) },
          { label: 'Máximo', value: String(max) },
        ].map((stat) => (
          <div
            key={stat.label}
            className="text-center bg-muted/40 rounded-xl py-3"
          >
            <div className="text-xl font-bold text-primary">{stat.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Estado vazio ─────────────────────────────────────────────────────────────

function EmptyCard({ question }: { question: ChartQuestion }) {
  return (
    <div className="bg-white rounded-2xl border border-border p-4 shadow-sm">
      <QuestionHeader question={question} count={0} />
      <p className="text-xs text-muted-foreground mt-2">
        Nenhuma resposta para este filtro.
      </p>
    </div>
  )
}

// ─── Cabeçalho do card ────────────────────────────────────────────────────────

function QuestionHeader({
  question,
  count,
  children,
}: {
  question: ChartQuestion
  count: number
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-2 mb-3">
      <p className="text-sm font-medium text-foreground leading-snug flex-1">
        {question.text}
      </p>
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className="text-xs text-muted-foreground tabular-nums">
          {count} resp.
        </span>
        {children}
      </div>
    </div>
  )
}
