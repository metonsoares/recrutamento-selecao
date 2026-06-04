'use client'
import { useState } from 'react'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface QuestionOption { text: string; weight: number }
interface Question { id: string; text: string; type?: 'texto' | 'multipla'; options: QuestionOption[] }

interface Props {
  token: string
  title: string
  description: string | null
  companyName: string | null
  questions: Question[]
  funcionarios: { id: string; full_name: string }[]
  lockedCandidate?: { id: string; full_name: string } | null
}

export function PesquisaForm({ token, title, description, companyName, questions, funcionarios, lockedCandidate }: Props) {
  const [candidateId, setCandidateId] = useState(lockedCandidate?.id || '')
  const [answers, setAnswers] = useState<Record<string, number | string>>({})
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  function setAnswer(qid: string, val: number | string) { setAnswers(p => ({ ...p, [qid]: val })) }

  async function submit() {
    setError('')
    if (funcionarios.length > 0 && !candidateId) { setError('Selecione seu nome.'); return }
    const faltando = questions.some(q => {
      const a = answers[q.id]
      if (q.type === 'texto') return !a || !String(a).trim()
      return a == null
    })
    if (faltando) { setError('Responda todas as perguntas.'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/public/climate/${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_id: candidateId || null, answers }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setDone(true)
    } catch (e) { setError((e as Error).message || 'Erro ao enviar.') }
    finally { setSaving(false) }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-2xl shadow-sm border p-8 max-w-md text-center space-y-3">
          <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
          <h1 className="text-xl font-bold text-gray-900">Obrigado pela participação!</h1>
          <p className="text-sm text-muted-foreground">Sua resposta foi registrada com sucesso.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="bg-white rounded-2xl border shadow-sm p-6 text-center">
          {companyName && <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">{companyName}</p>}
          <h1 className="text-xl font-bold text-gray-900 mt-1">{title}</h1>
          {description && <p className="text-sm text-muted-foreground mt-2">{description}</p>}
          <p className="text-[12px] text-emerald-700 mt-3">Pesquisa de clima organizacional — sua opinião é importante.</p>
        </div>

        {lockedCandidate ? (
          <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Respondendo como</label>
            <p className="text-sm font-semibold text-gray-900">{lockedCandidate.full_name}</p>
          </div>
        ) : funcionarios.length > 0 && (
          <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Identifique-se *</label>
            <select value={candidateId} onChange={e => setCandidateId(e.target.value)}
              className="h-10 w-full border border-gray-300 rounded-md px-3 text-sm bg-white">
              <option value="">Selecione seu nome...</option>
              {funcionarios.map(f => <option key={f.id} value={f.id}>{f.full_name}</option>)}
            </select>
          </div>
        )}

        {questions.map((q, i) => (
          <div key={q.id} className="bg-white rounded-2xl border shadow-sm p-5 space-y-2.5">
            <p className="text-sm font-semibold text-gray-900">{i + 1}. {q.text} <span className="text-red-500">*</span></p>
            {q.type === 'texto' ? (
              <textarea
                value={typeof answers[q.id] === 'string' ? (answers[q.id] as string) : ''}
                onChange={e => setAnswer(q.id, e.target.value)}
                rows={3} placeholder="Sua resposta..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            ) : (
              <div className="space-y-1.5">
                {q.options.map((o, idx) => (
                  <label key={idx} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${answers[q.id] === idx ? 'border-primary bg-primary/5' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <input type="radio" checked={answers[q.id] === idx} onChange={() => setAnswer(q.id, idx)} className="accent-primary" />
                    <span className="text-sm text-gray-700">{o.text}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}

        {error && <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertCircle className="w-4 h-4" />{error}</p>}

        <Button onClick={submit} disabled={saving} className="w-full h-12 text-base gap-2">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Enviando...</> : 'Enviar respostas'}
        </Button>
      </div>
    </div>
  )
}
