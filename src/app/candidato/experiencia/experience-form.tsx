'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { FormQuestion } from '@/types'

interface Props {
  application: { id: string; candidates?: { full_name?: string } | null; jobs?: { title?: string } | null }
  questions: FormQuestion[]
  jobs: { id: string; title: string }[]
  token: string
}

export function ExperienceForm({ application, questions, jobs, token }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  function setAnswer(questionId: string, value: string) {
    setAnswers(prev => ({ ...prev, [questionId]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const res = await fetch('/api/public/experience-form', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, answers }),
    })
    if (res.ok) setDone(true)
    setSubmitting(false)
  }

  if (done) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-8 text-center space-y-4">
        <p className="text-4xl">🎉</p>
        <h2 className="font-bold text-xl">Formulário enviado!</h2>
        <p className="text-muted-foreground text-sm">
          Obrigado, {(application.candidates as { full_name?: string } | null)?.full_name}! Suas informações foram recebidas.
          Em breve você receberá o link para o teste cultural pelo WhatsApp.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <h1 className="text-xl font-bold">Formulário de Experiência</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Olá, {(application.candidates as { full_name?: string } | null)?.full_name}! Preencha com atenção — suas respostas são importantes para nossa análise.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {questions.map(q => (
          <div key={q.id} className="bg-white rounded-xl shadow-sm p-4 space-y-2">
            <Label className="text-sm font-medium">
              {q.question_text}
              {q.is_required && <span className="text-red-500 ml-1">*</span>}
            </Label>

            {q.field_type === 'long_text' && (
              <Textarea
                value={answers[q.id] || ''}
                onChange={e => setAnswer(q.id, e.target.value)}
                required={q.is_required}
                rows={3}
                placeholder="Escreva sua resposta aqui..."
              />
            )}

            {(q.field_type === 'short_text' || q.field_type === 'number' || q.field_type === 'phone' || q.field_type === 'email') && (
              <Input
                type={q.field_type === 'number' ? 'number' : q.field_type === 'email' ? 'email' : 'text'}
                value={answers[q.id] || ''}
                onChange={e => setAnswer(q.id, e.target.value)}
                required={q.is_required}
                placeholder="Sua resposta..."
              />
            )}

            {q.field_type === 'yes_no' && (
              <div className="flex gap-3">
                {['Sim', 'Não'].map(opt => (
                  <label key={opt} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={q.id}
                      value={opt}
                      checked={answers[q.id] === opt}
                      onChange={() => setAnswer(q.id, opt)}
                      required={q.is_required}
                    />
                    <span className="text-sm">{opt}</span>
                  </label>
                ))}
              </div>
            )}

            {q.field_type === 'select' && q.question_text.toLowerCase().includes('vaga') ? (
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={answers[q.id] || ''}
                onChange={e => setAnswer(q.id, e.target.value)}
                required={q.is_required}
              >
                <option value="">Selecionar...</option>
                {jobs.map(j => <option key={j.id} value={j.title}>{j.title}</option>)}
              </select>
            ) : q.field_type === 'select' ? (
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={answers[q.id] || ''}
                onChange={e => setAnswer(q.id, e.target.value)}
                required={q.is_required}
              >
                <option value="">Selecionar...</option>
                {(q.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : null}

            {q.field_type === 'date' && (
              <Input
                type="date"
                value={answers[q.id] || ''}
                onChange={e => setAnswer(q.id, e.target.value)}
                required={q.is_required}
              />
            )}

            {q.field_type === 'file_upload' && (
              <p className="text-xs text-muted-foreground">Upload de arquivo disponível em breve.</p>
            )}
          </div>
        ))}

        <Button type="submit" className="w-full" size="lg" disabled={submitting}>
          {submitting ? 'Enviando...' : 'Enviar Formulário'}
        </Button>
      </form>
    </div>
  )
}
