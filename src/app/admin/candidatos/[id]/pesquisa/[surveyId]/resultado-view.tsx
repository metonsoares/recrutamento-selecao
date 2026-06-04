'use client'
import { useState } from 'react'
import { Loader2, Brain, FileDown, BarChart3 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AnswerRow { question: string; answer: string; isText: boolean }
interface Props {
  candidateId: string
  surveyId: string
  responseId: string
  candidateName: string
  surveyTitle: string
  companyName: string | null
  filledAt: string
  pct: number | null
  totalScore: number | null
  maxScore: number | null
  rows: AnswerRow[]
}

export function PesquisaResultadoView({ surveyId, responseId, candidateName, surveyTitle, companyName, filledAt, pct, totalScore, maxScore, rows }: Props) {
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState('')

  function tone(p: number) { return p >= 70 ? 'text-emerald-600' : p >= 50 ? 'text-amber-600' : 'text-red-600' }

  async function analyze() {
    setAnalyzing(true); setAnalysis('')
    try {
      const res = await fetch(`/api/admin/climate-surveys/${surveyId}/analyze-response`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ responseId }),
      })
      const json = await res.json()
      setAnalysis(json.analysis || json.error || 'Sem análise.')
    } finally { setAnalyzing(false) }
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5 print:p-0">
      <div className="flex items-start justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-[#333]" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Resultado da pesquisa</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{candidateName}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={analyze} disabled={analyzing} className="gap-1.5">
            {analyzing ? <><Loader2 className="w-4 h-4 animate-spin" />Analisando...</> : <><Brain className="w-4 h-4" />Interpretar com IA</>}
          </Button>
          <Button variant="outline" onClick={() => window.print()} className="gap-1.5"><FileDown className="w-4 h-4" />Exportar PDF</Button>
        </div>
      </div>

      {/* Cabeçalho (impressão também) */}
      <div className="bg-white rounded-xl border p-5">
        {companyName && <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">{companyName}</p>}
        <h2 className="text-lg font-bold text-gray-900">{surveyTitle}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{candidateName} — preenchida em {filledAt}</p>
        {pct != null && (
          <div className="mt-3 flex items-center gap-3">
            <span className="text-[11px] uppercase text-muted-foreground">Pontuação</span>
            <span className={`text-2xl font-bold ${tone(pct)}`}>{pct}%</span>
            {totalScore != null && maxScore != null && <span className="text-sm text-muted-foreground">({totalScore} de {maxScore})</span>}
          </div>
        )}
      </div>

      {/* Respostas */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-3">Respostas</h3>
        <div className="space-y-2.5">
          {rows.map((r, i) => (
            <div key={i} className="text-sm border-b border-gray-100 pb-2 last:border-0">
              <p className="text-gray-600">{i + 1}. {r.question}</p>
              <p className="text-gray-900 font-medium mt-0.5 pl-3 whitespace-pre-wrap">↳ {r.answer}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Análise IA */}
      {analysis && (
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1.5"><Brain className="w-4 h-4" />Análise individual da IA</h3>
          <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{analysis}</div>
        </div>
      )}
    </div>
  )
}
