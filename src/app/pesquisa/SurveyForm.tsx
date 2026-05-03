'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import type {
  SurveyWithSections,
  SectionWithQuestions,
  QuestionWithOptions,
  AnswerSubmission,
} from '@/lib/types/database'

// ─── Chaves de sessionStorage ─────────────────────────────────────────────────
const SS = {
  ID: 'brownie_respondent_id',
  NAME: 'brownie_respondent_name',
  ROLE: 'brownie_respondent_role',
  ANSWERS: 'brownie_survey_answers',
  SECTION: 'brownie_survey_section',
} as const

function clearSession() {
  Object.values(SS).forEach((k) => sessionStorage.removeItem(k))
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props {
  survey: SurveyWithSections
}

export default function SurveyForm({ survey }: Props) {
  const router = useRouter()
  const sections = survey.survey_sections

  // Identidade do respondente (lida do sessionStorage no mount)
  const [respondent, setRespondent] = useState<{
    id: string
    name: string
    role: string
  } | null>(null)

  // Controle da seção atual
  const [sectionIndex, setSectionIndex] = useState(0)
  const [slideDir, setSlideDir] = useState<'forward' | 'back'>('forward')

  // Respostas
  const [answers, setAnswers] = useState<Record<string, AnswerSubmission>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Submissão
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  // Controla se a inicialização já ocorreu (evita flash de conteúdo)
  const [ready, setReady] = useState(false)

  // Ref do container de perguntas para rolar ao erro
  const questionsRef = useRef<HTMLElement>(null)

  // ─── Inicialização: lê sessionStorage, restaura progresso ──────────────────
  useEffect(() => {
    const id = sessionStorage.getItem(SS.ID)
    const name = sessionStorage.getItem(SS.NAME)
    const role = sessionStorage.getItem(SS.ROLE)

    if (!id || !name || !role) {
      router.replace('/')
      return
    }

    setRespondent({ id, name, role })

    // Restaura progresso salvo
    const savedAnswers = sessionStorage.getItem(SS.ANSWERS)
    const savedSection = sessionStorage.getItem(SS.SECTION)

    if (savedAnswers) {
      try {
        setAnswers(JSON.parse(savedAnswers))
      } catch {
        // Ignora dados corrompidos
      }
    }

    if (savedSection) {
      const idx = parseInt(savedSection, 10)
      if (!isNaN(idx) && idx >= 0 && idx < sections.length) {
        setSectionIndex(idx)
      }
    }

    setReady(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Auto-save de progresso ────────────────────────────────────────────────
  useEffect(() => {
    if (!ready) return
    sessionStorage.setItem(SS.ANSWERS, JSON.stringify(answers))
    sessionStorage.setItem(SS.SECTION, String(sectionIndex))
  }, [answers, sectionIndex, ready])

  // ─── Rola para o topo ao trocar de seção ──────────────────────────────────
  useEffect(() => {
    if (!ready) return
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [sectionIndex, ready])

  // ─── Rola para o primeiro erro ────────────────────────────────────────────
  useEffect(() => {
    if (Object.keys(errors).length === 0) return
    // Pequeno delay para aguardar re-render
    const t = setTimeout(() => {
      const firstError = questionsRef.current?.querySelector('[data-has-error="true"]')
      firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
    return () => clearTimeout(t)
  }, [errors])

  // ─── Atualiza resposta de uma pergunta ────────────────────────────────────
  const setAnswer = useCallback(
    (questionId: string, update: Partial<AnswerSubmission>) => {
      setAnswers((prev) => ({
        ...prev,
        [questionId]: { ...prev[questionId], question_id: questionId, ...update },
      }))
      // Remove erro da pergunta assim que ela for respondida
      setErrors((prev) => {
        if (!prev[questionId]) return prev
        const next = { ...prev }
        delete next[questionId]
        return next
      })
      // Limpa erro de submit ao interagir
      setSubmitError(null)
    },
    []
  )

  // ─── Validação de seção ────────────────────────────────────────────────────
  function validateSection(section: SectionWithQuestions): boolean {
    const errs: Record<string, string> = {}

    for (const q of section.questions) {
      if (!q.is_required) continue
      const ans = answers[q.id]

      if (!ans) {
        errs[q.id] = 'Esta pergunta é obrigatória.'
        continue
      }

      if (
        (q.question_type === 'single_choice' || q.question_type === 'multiple_choice') &&
        (!ans.option_ids || ans.option_ids.length === 0)
      ) {
        errs[q.id] = 'Selecione ao menos uma opção.'
      }

      if (q.question_type === 'scale' && ans.answer_number == null) {
        errs[q.id] = 'Selecione um valor de 1 a 5.'
      }

      if (q.question_type === 'number' && ans.answer_number == null) {
        errs[q.id] = 'Informe um número.'
      }

      if (q.question_type === 'open_text' && !ans.answer_text?.trim()) {
        errs[q.id] = 'Esta pergunta é obrigatória.'
      }
    }

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  // ─── Navegação ─────────────────────────────────────────────────────────────
  function handleNext() {
    if (!validateSection(currentSection)) return
    setSlideDir('forward')
    setSectionIndex((i) => i + 1)
  }

  function handleBack() {
    setErrors({})
    setSubmitError(null)
    setSlideDir('back')
    setSectionIndex((i) => i - 1)
  }

  // ─── Submissão ─────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!validateSection(currentSection)) return
    if (!respondent || submitted) return

    setSubmitting(true)
    setSubmitError(null)

    try {
      const res = await fetch('/api/submit-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          survey_id: survey.id,
          respondent_id: respondent.id,
          answers: Object.values(answers),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error ?? 'Erro ao enviar. Tente novamente.')
      }

      setSubmitted(true)
      clearSession()
      router.push('/obrigado')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Erro inesperado.')
      setSubmitting(false)
    }
  }

  // ─── Tela de carregamento inicial ─────────────────────────────────────────
  if (!ready) {
    return (
      <main className="min-h-screen brand-gradient-soft flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
          <span className="text-sm">Carregando pesquisa...</span>
        </div>
      </main>
    )
  }

  const totalSections = sections.length
  const currentSection: SectionWithQuestions = sections[sectionIndex]
  const progress = ((sectionIndex + 1) / totalSections) * 100
  const isLastSection = sectionIndex === totalSections - 1

  return (
    <main className="min-h-screen brand-gradient-soft flex flex-col">
      {/* ─── Header sticky ──────────────────────────────────────────────────── */}
      <header className="brand-gradient px-5 pt-5 pb-4 text-white sticky top-0 z-20 shadow-md">
        <div className="max-w-lg mx-auto">
          {/* Progresso */}
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium opacity-80">
              Seção {sectionIndex + 1} de {totalSections}
            </span>
            <span className="text-xs opacity-70 tabular-nums">
              {Math.round(progress)}% concluído
            </span>
          </div>

          <Progress
            value={progress}
            className="h-1.5 bg-white/20 [&>div]:bg-accent [&>div]:transition-all [&>div]:duration-500"
          />

          {/* Nome da seção + identificação */}
          <div className="mt-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold leading-snug">
                {currentSection.title}
              </h2>
              {currentSection.description && (
                <p className="text-xs opacity-70 mt-0.5 leading-snug">
                  {currentSection.description}
                </p>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs opacity-70 leading-tight">{respondent?.name}</p>
              <p className="text-xs opacity-50 leading-tight">{respondent?.role}</p>
            </div>
          </div>
        </div>
      </header>

      {/* ─── Perguntas ──────────────────────────────────────────────────────── */}
      <section
        ref={questionsRef}
        // A chave muda a cada seção, disparando a animação de entrada
        key={`section-${sectionIndex}-${slideDir}`}
        className={[
          'flex-1 px-4 py-5 max-w-lg mx-auto w-full space-y-4',
          'animate-in fade-in duration-200',
          slideDir === 'forward' ? 'slide-in-from-right-4' : 'slide-in-from-left-4',
        ].join(' ')}
      >
        {currentSection.questions.map((question) => (
          <QuestionCard
            key={question.id}
            question={question}
            answer={answers[question.id]}
            error={errors[question.id]}
            onChange={setAnswer}
          />
        ))}

        {/* Erro de submissão */}
        {submitError && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-sm text-destructive leading-snug">
            {submitError}
          </div>
        )}

        {/* Espaço extra para a barra de navegação não cobrir conteúdo */}
        <div className="h-4" />
      </section>

      {/* ─── Navegação sticky no rodapé ─────────────────────────────────────── */}
      <nav className="sticky bottom-0 z-20 bg-white/95 backdrop-blur-sm border-t border-border px-4 py-3 shadow-[0_-1px_8px_rgba(0,0,0,.06)]">
        <div className="max-w-lg mx-auto flex gap-3">
          {/* Botão Voltar */}
          {sectionIndex > 0 && (
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={submitting}
              className="flex-none h-12 px-5 rounded-xl text-sm"
            >
              ← Voltar
            </Button>
          )}

          {/* Botão Avançar ou Enviar */}
          {isLastSection ? (
            <Button
              onClick={handleSubmit}
              disabled={submitting || submitted}
              className="flex-1 h-12 rounded-xl font-semibold text-base"
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Enviando...
                </span>
              ) : (
                'Enviar Pesquisa ✓'
              )}
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              className="flex-1 h-12 rounded-xl font-semibold text-base"
            >
              Próxima Seção →
            </Button>
          )}
        </div>

        {/* Indicador de seções (pontos) */}
        <div className="flex justify-center gap-1 mt-2.5">
          {sections.map((_, i) => (
            <div
              key={i}
              className={[
                'rounded-full transition-all duration-300',
                i === sectionIndex
                  ? 'w-4 h-1.5 bg-primary'
                  : i < sectionIndex
                  ? 'w-1.5 h-1.5 bg-primary/40'
                  : 'w-1.5 h-1.5 bg-muted-foreground/20',
              ].join(' ')}
            />
          ))}
        </div>
      </nav>
    </main>
  )
}

// ─── Card de pergunta ─────────────────────────────────────────────────────────

interface QuestionCardProps {
  question: QuestionWithOptions
  answer?: AnswerSubmission
  error?: string
  onChange: (questionId: string, update: Partial<AnswerSubmission>) => void
}

function QuestionCard({ question, answer, error, onChange }: QuestionCardProps) {
  return (
    <div
      data-has-error={error ? 'true' : undefined}
      className={[
        'bg-white rounded-2xl border p-4 shadow-sm transition-colors duration-200',
        error
          ? 'border-destructive/50 shadow-[0_0_0_1px] shadow-destructive/20'
          : 'border-border',
      ].join(' ')}
    >
      <p className="text-sm font-medium text-foreground leading-snug mb-3">
        {question.question_text}
        {question.is_required && (
          <span className="text-destructive ml-1 select-none">*</span>
        )}
      </p>

      {question.question_type === 'single_choice' && (
        <SingleChoice question={question} answer={answer} onChange={onChange} />
      )}
      {question.question_type === 'multiple_choice' && (
        <MultipleChoice question={question} answer={answer} onChange={onChange} />
      )}
      {question.question_type === 'scale' && (
        <ScaleInput question={question} answer={answer} onChange={onChange} />
      )}
      {question.question_type === 'open_text' && (
        <OpenText question={question} answer={answer} onChange={onChange} />
      )}
      {question.question_type === 'number' && (
        <NumberInput question={question} answer={answer} onChange={onChange} />
      )}

      {error && (
        <p className="text-xs text-destructive mt-2.5 flex items-center gap-1">
          <span>⚠</span> {error}
        </p>
      )}
    </div>
  )
}

// ─── Escolha única ────────────────────────────────────────────────────────────

function SingleChoice({ question, answer, onChange }: QuestionCardProps) {
  const selected = answer?.option_ids?.[0]

  return (
    <div className="space-y-2">
      {question.question_options.map((opt) => {
        const isSelected = selected === opt.id
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(question.id, { option_ids: [opt.id] })}
            className={[
              'w-full text-left px-4 py-3.5 rounded-xl border text-sm transition-all',
              'flex items-center gap-3',
              isSelected
                ? 'bg-primary/8 border-primary text-primary font-medium'
                : 'bg-white border-border text-foreground hover:border-primary/50 active:bg-muted',
            ].join(' ')}
          >
            {/* Indicador de seleção */}
            <span
              className={[
                'flex-shrink-0 w-4 h-4 rounded-full border-2 transition-all flex items-center justify-center',
                isSelected ? 'border-primary' : 'border-muted-foreground/40',
              ].join(' ')}
            >
              {isSelected && (
                <span className="w-2 h-2 rounded-full bg-primary" />
              )}
            </span>
            <span className="leading-snug">{opt.option_text}</span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Múltipla escolha ─────────────────────────────────────────────────────────

function MultipleChoice({ question, answer, onChange }: QuestionCardProps) {
  const selected = answer?.option_ids ?? []
  const max = question.max_choices ?? question.question_options.length
  const hasLimit = max < question.question_options.length

  function toggle(optId: string) {
    if (selected.includes(optId)) {
      onChange(question.id, { option_ids: selected.filter((id) => id !== optId) })
    } else if (selected.length < max) {
      onChange(question.id, { option_ids: [...selected, optId] })
    }
  }

  return (
    <div className="space-y-2">
      {hasLimit && (
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1 px-1">
          <span>Selecione até {max} opções</span>
          <span
            className={[
              'font-medium tabular-nums',
              selected.length >= max ? 'text-primary' : '',
            ].join(' ')}
          >
            {selected.length} / {max}
          </span>
        </div>
      )}
      {question.question_options.map((opt) => {
        const isSelected = selected.includes(opt.id)
        const isDisabled = !isSelected && selected.length >= max

        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => toggle(opt.id)}
            disabled={isDisabled}
            className={[
              'w-full text-left px-4 py-3.5 rounded-xl border text-sm transition-all',
              'flex items-start gap-3',
              isSelected
                ? 'bg-primary/8 border-primary text-primary font-medium'
                : isDisabled
                ? 'bg-muted/60 border-border/50 text-muted-foreground cursor-not-allowed'
                : 'bg-white border-border text-foreground hover:border-primary/50 active:bg-muted',
            ].join(' ')}
          >
            {/* Checkbox visual */}
            <span
              className={[
                'flex-shrink-0 mt-0.5 w-4 h-4 rounded border-2 transition-all flex items-center justify-center',
                isSelected
                  ? 'border-primary bg-primary'
                  : isDisabled
                  ? 'border-muted-foreground/20'
                  : 'border-muted-foreground/40',
              ].join(' ')}
            >
              {isSelected && (
                <svg
                  className="w-2.5 h-2.5 text-white"
                  fill="none"
                  viewBox="0 0 10 8"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path d="M1 4l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span className="leading-snug">{opt.option_text}</span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Escala 1–5 ───────────────────────────────────────────────────────────────

function ScaleInput({ question, answer, onChange }: QuestionCardProps) {
  const opts = question.question_options
  const selected = answer?.answer_number

  // Extrai só o rótulo (remove o número do início: "1 – Muito ruim" → "Muito ruim")
  function label(text: string) {
    return text.replace(/^\d+\s*[–-]\s*/, '')
  }

  return (
    <div className="space-y-3">
      {/* Botões numéricos */}
      <div className="grid grid-cols-5 gap-2">
        {opts.map((opt, i) => {
          const val = i + 1
          const isSelected = selected === val
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() =>
                onChange(question.id, { option_ids: [opt.id], answer_number: val })
              }
              className={[
                'h-14 rounded-xl border-2 text-lg font-bold transition-all',
                'flex flex-col items-center justify-center gap-0.5',
                isSelected
                  ? 'bg-primary border-primary text-primary-foreground shadow-sm scale-105'
                  : 'bg-white border-border text-foreground hover:border-primary/60 active:scale-95',
              ].join(' ')}
            >
              {val}
            </button>
          )
        })}
      </div>

      {/* Labels das extremidades */}
      {opts.length >= 2 && (
        <div className="flex justify-between text-xs text-muted-foreground px-1">
          <span className="max-w-[40%] leading-tight text-left">
            {label(opts[0].option_text)}
          </span>
          <span className="max-w-[40%] leading-tight text-right">
            {label(opts[opts.length - 1].option_text)}
          </span>
        </div>
      )}

      {/* Label da opção selecionada */}
      {selected != null && opts[selected - 1] && (
        <p className="text-xs text-center text-primary font-medium">
          {opts[selected - 1].option_text}
        </p>
      )}
    </div>
  )
}

// ─── Texto aberto ─────────────────────────────────────────────────────────────

function OpenText({ question, answer, onChange }: QuestionCardProps) {
  const text = answer?.answer_text ?? ''
  return (
    <div className="space-y-1.5">
      <Textarea
        value={text}
        onChange={(e) => onChange(question.id, { answer_text: e.target.value })}
        placeholder="Digite sua resposta aqui..."
        className="min-h-[110px] text-sm rounded-xl resize-none focus-visible:ring-primary"
      />
      {text.length > 0 && (
        <p className="text-xs text-muted-foreground text-right tabular-nums">
          {text.length} caracteres
        </p>
      )}
    </div>
  )
}

// ─── Número ───────────────────────────────────────────────────────────────────

function NumberInput({ question, answer, onChange }: QuestionCardProps) {
  return (
    <Input
      type="number"
      inputMode="numeric"
      value={answer?.answer_number ?? ''}
      onChange={(e) => {
        const val = e.target.value === '' ? undefined : Number(e.target.value)
        onChange(question.id, { answer_number: val })
      }}
      placeholder="Digite um número"
      className="h-12 text-base rounded-xl"
      min={0}
      max={120}
    />
  )
}
