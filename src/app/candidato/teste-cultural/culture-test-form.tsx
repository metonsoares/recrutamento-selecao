'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CultureQuestion } from '@/types'

interface Props {
  application: { id: string; candidates?: { full_name?: string } | null }
  questions: CultureQuestion[]
  token: string
}

export function CultureTestForm({ application, questions, token }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const progress = Math.round((Object.keys(answers).length / questions.length) * 100)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (Object.keys(answers).length < questions.length) {
      alert('Por favor, responda todas as perguntas.')
      return
    }
    setSubmitting(true)
    const res = await fetch('/api/public/culture-test', {
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
        <p className="text-4xl">🏆</p>
        <h2 className="font-bold text-xl">Teste concluído!</h2>
        <p className="text-muted-foreground text-sm">
          Parabéns, {(application.candidates as { full_name?: string } | null)?.full_name}! Seu cadastro foi concluído com sucesso.
          Nossa equipe irá analisar seu perfil e entraremos em contato pelo WhatsApp em breve.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <h1 className="text-xl font-bold">Teste Cultural</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Responda com sinceridade — não existe resposta certa ou errada. Queremos conhecer você de verdade.
        </p>
        <div className="mt-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>{Object.keys(answers).length}/{questions.length} respondidas</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {questions.map((q, idx) => (
          <div key={q.id} className="bg-white rounded-xl shadow-sm p-4 space-y-3">
            <p className="text-sm font-medium">
              <span className="text-muted-foreground mr-2">{idx + 1}.</span>
              {q.question_text}
            </p>
            <div className="space-y-2">
              {(q.options || []).map((opt, i) => {
                const letter = ['A', 'B', 'C', 'D'][i]
                const selected = answers[q.id] === letter
                return (
                  <label
                    key={letter}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30'
                    }`}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      value={letter}
                      checked={selected}
                      onChange={() => setAnswers(prev => ({ ...prev, [q.id]: letter }))}
                      className="mt-0.5 shrink-0"
                    />
                    <span className="text-sm">{opt}</span>
                  </label>
                )
              })}
            </div>
          </div>
        ))}

        <Button type="submit" className="w-full" size="lg" disabled={submitting}>
          {submitting ? 'Enviando...' : 'Concluir Teste'}
        </Button>
      </form>
    </div>
  )
}
