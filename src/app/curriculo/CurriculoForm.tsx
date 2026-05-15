'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { FormQuestion } from '@/types'

interface Props {
  jobs: { id: string; title: string }[]
  questions: FormQuestion[]
  companyInfo: { mission: string | null; company_culture: string | null } | null
}

export function CurriculoForm({ jobs, questions, companyInfo }: Props) {
  const router = useRouter()

  // Fixed fields
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [city, setCity] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [jobId, setJobId] = useState('')

  // Dynamic answers: question_id -> string | string[]
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})

  // LGPD
  const [lgpd, setLgpd] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setAnswer(questionId: string, value: string | string[]) {
    setAnswers(prev => ({ ...prev, [questionId]: value }))
  }

  function toggleMultiChoice(questionId: string, option: string) {
    setAnswers(prev => {
      const current = (prev[questionId] as string[]) || []
      const exists = current.includes(option)
      return {
        ...prev,
        [questionId]: exists ? current.filter(o => o !== option) : [...current, option],
      }
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!lgpd) {
      setError('Você precisa aceitar os termos de uso de dados para continuar.')
      return
    }
    setError(null)
    setSubmitting(true)

    try {
      const res = await fetch('/api/public/curriculo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          phone,
          email: email || undefined,
          city,
          neighborhood: neighborhood || undefined,
          job_id: jobId || undefined,
          lgpd_accepted: true,
          answers,
        }),
      })

      const data = await res.json()

      if (!res.ok || data.error) {
        setError(data.error || 'Ocorreu um erro. Tente novamente.')
        setSubmitting(false)
        return
      }

      router.push('/curriculo/obrigado')
    } catch {
      setError('Erro de conexão. Verifique sua internet e tente novamente.')
      setSubmitting(false)
    }
  }

  function renderDynamicField(q: FormQuestion) {
    switch (q.field_type) {
      case 'long_text':
        return (
          <Textarea
            id={q.id}
            value={(answers[q.id] as string) || ''}
            onChange={e => setAnswer(q.id, e.target.value)}
            required={q.is_required}
            rows={4}
            placeholder="Escreva sua resposta aqui..."
            className="resize-none"
          />
        )

      case 'yes_no':
        return (
          <div className="flex gap-4">
            {['Sim', 'Não'].map(opt => (
              <label key={opt} className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="radio"
                  name={q.id}
                  value={opt}
                  checked={answers[q.id] === opt}
                  onChange={() => setAnswer(q.id, opt)}
                  required={q.is_required && !answers[q.id]}
                  className="accent-primary w-4 h-4"
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        )

      case 'select':
        return (
          <select
            id={q.id}
            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            value={(answers[q.id] as string) || ''}
            onChange={e => setAnswer(q.id, e.target.value)}
            required={q.is_required}
          >
            <option value="">Selecionar...</option>
            {(q.options || []).map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        )

      case 'multiple_choice':
        return (
          <div className="space-y-2">
            {(q.options || []).map(opt => {
              const selected = ((answers[q.id] as string[]) || []).includes(opt)
              return (
                <label key={opt} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleMultiChoice(q.id, opt)}
                    className="accent-primary w-4 h-4"
                  />
                  <span>{opt}</span>
                </label>
              )
            })}
          </div>
        )

      case 'number':
        return (
          <Input
            id={q.id}
            type="number"
            value={(answers[q.id] as string) || ''}
            onChange={e => setAnswer(q.id, e.target.value)}
            required={q.is_required}
            placeholder="0"
          />
        )

      case 'date':
        return (
          <Input
            id={q.id}
            type="date"
            value={(answers[q.id] as string) || ''}
            onChange={e => setAnswer(q.id, e.target.value)}
            required={q.is_required}
          />
        )

      case 'scale': {
        const current = answers[q.id] as string
        return (
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setAnswer(q.id, String(n))}
                className={`w-10 h-10 rounded-lg border text-sm font-semibold transition-all
                  ${current === String(n)
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'border-input bg-background hover:border-primary/50 hover:bg-primary/5'
                  }`}
              >
                {n}
              </button>
            ))}
          </div>
        )
      }

      default:
        return (
          <Input
            id={q.id}
            type="text"
            value={(answers[q.id] as string) || ''}
            onChange={e => setAnswer(q.id, e.target.value)}
            required={q.is_required}
            placeholder="Sua resposta..."
          />
        )
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 py-8 px-4">
      <div className="max-w-xl mx-auto space-y-5">

        {/* Brand Header */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-2 bg-white rounded-full px-4 py-1.5 shadow-sm border border-green-100 mb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-primary inline-block" />
            <span className="text-sm font-semibold text-primary">Brownie do Ton</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Cadastre seu Currículo</h1>
          {companyInfo?.mission && (
            <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
              {companyInfo.mission}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Fixed Fields Card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
            <div>
              <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">
                Dados Pessoais
              </h2>
            </div>

            {/* Nome */}
            <div className="space-y-1.5">
              <Label htmlFor="full_name" className="text-sm font-medium">
                Nome completo <span className="text-red-500">*</span>
              </Label>
              <Input
                id="full_name"
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                required
                placeholder="Seu nome completo"
                className="h-10"
              />
            </div>

            {/* Telefone */}
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="text-sm font-medium">
                Telefone com DDD <span className="text-red-500">*</span>
              </Label>
              <Input
                id="phone"
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                required
                placeholder="11 99999-9999"
                className="h-10"
              />
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium">
                E-mail{' '}
                <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="h-10"
              />
            </div>

            {/* Cidade */}
            <div className="space-y-1.5">
              <Label htmlFor="city" className="text-sm font-medium">
                Cidade <span className="text-red-500">*</span>
              </Label>
              <Input
                id="city"
                type="text"
                value={city}
                onChange={e => setCity(e.target.value)}
                required
                placeholder="Sua cidade"
                className="h-10"
              />
            </div>

            {/* Bairro */}
            <div className="space-y-1.5">
              <Label htmlFor="neighborhood" className="text-sm font-medium">
                Bairro{' '}
                <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Input
                id="neighborhood"
                type="text"
                value={neighborhood}
                onChange={e => setNeighborhood(e.target.value)}
                placeholder="Seu bairro"
                className="h-10"
              />
            </div>

            {/* Vaga de interesse */}
            {jobs.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="job_id" className="text-sm font-medium">
                  Vaga de interesse{' '}
                  <span className="text-muted-foreground font-normal">(opcional)</span>
                </Label>
                <select
                  id="job_id"
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background h-10 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  value={jobId}
                  onChange={e => setJobId(e.target.value)}
                >
                  <option value="">Não tenho preferência</option>
                  {jobs.map(j => (
                    <option key={j.id} value={j.id}>{j.title}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Dynamic Questions */}
          {questions.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
              <div>
                <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">
                  Informações Adicionais
                </h2>
              </div>

              {questions.map(q => (
                <div key={q.id} className="space-y-1.5">
                  <Label htmlFor={q.id} className="text-sm font-medium">
                    {q.question_text}
                    {q.is_required && <span className="text-red-500 ml-1">*</span>}
                  </Label>
                  {q.description && (
                    <p className="text-xs text-muted-foreground">{q.description}</p>
                  )}
                  {renderDynamicField(q)}
                </div>
              ))}
            </div>
          )}

          {/* LGPD */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={lgpd}
                onChange={e => setLgpd(e.target.checked)}
                className="accent-primary w-4 h-4 mt-0.5 flex-shrink-0"
                required
              />
              <span className="text-sm text-muted-foreground leading-relaxed">
                Li e aceito que meus dados sejam utilizados para fins de recrutamento pela{' '}
                <strong className="text-gray-700">Brownie do Ton</strong>.
              </span>
            </label>
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Submit */}
          <Button
            type="submit"
            className="w-full h-12 text-base font-semibold rounded-xl"
            disabled={submitting || !lgpd}
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Enviando...
              </span>
            ) : (
              'Enviar Currículo'
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground pb-4">
            Seus dados são protegidos e utilizados apenas para fins de recrutamento.
          </p>
        </form>
      </div>
    </div>
  )
}
