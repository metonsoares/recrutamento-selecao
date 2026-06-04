'use client'
import { useState } from 'react'
import { BarChart3, Loader2, Brain, FileDown, Users, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SurveyLite { id: string; title: string; company_name: string | null; climate_responses?: { count: number }[] }
interface QOption { text: string; weight: number }
interface Question { id: string; text: string; options: QOption[] }
interface ResponseRow { id: string; candidate_id: string | null; total_score: number | null; max_score: number | null; answers: Record<string, number>; created_at: string }

interface Props { surveys: SurveyLite[] }

export function ResultadosManager({ surveys }: Props) {
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<{ survey: { title: string; company_name: string | null; questions: Question[] }; responses: ResponseRow[]; nameMap: Record<string, string> } | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState('')

  async function load(id: string) {
    setSelectedId(id); setData(null); setAnalysis('')
    if (!id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/climate-surveys/${id}/responses`)
      const json = await res.json()
      if (res.ok) setData(json)
    } finally { setLoading(false) }
  }

  async function analyze() {
    if (!selectedId) return
    setAnalyzing(true); setAnalysis('')
    try {
      const res = await fetch(`/api/admin/climate-surveys/${selectedId}/analyze`, { method: 'POST' })
      const json = await res.json()
      setAnalysis(json.analysis || json.error || 'Sem análise.')
    } finally { setAnalyzing(false) }
  }

  // Indicadores
  const questions = data?.survey.questions || []
  const responses = data?.responses || []
  const total = responses.length

  const perQuestion = questions.map(q => {
    const maxW = q.options.length ? Math.max(...q.options.map(o => Number(o.weight) || 0)) : 0
    let soma = 0, n = 0
    for (const r of responses) {
      const idx = r.answers?.[q.id]
      if (idx != null && q.options[idx]) { soma += Number(q.options[idx].weight) || 0; n++ }
    }
    const media = n ? soma / n : 0
    return { text: q.text, aderencia: maxW ? Math.round((media / maxW) * 100) : 0 }
  })
  const mediaGeral = perQuestion.length ? Math.round(perQuestion.reduce((s, q) => s + q.aderencia, 0) / perQuestion.length) : 0

  const perFunc = responses.map(r => {
    const pct = r.max_score ? Math.round(((r.total_score || 0) / r.max_score) * 100) : 0
    return { nome: r.candidate_id ? (data?.nameMap[r.candidate_id] || 'Identificado') : 'Anônimo', pct }
  })

  function tone(pct: number) { return pct >= 70 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-red-600' }
  function bar(pct: number) { return pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400' }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5 print:p-0">
      <div className="flex items-center gap-3 print:hidden">
        <BarChart3 className="w-6 h-6 text-[#333]" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Resultados das pesquisas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Análise de clima por funcionário e por empresa</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 print:hidden">
        <select value={selectedId} onChange={e => load(e.target.value)}
          className="h-10 border border-gray-300 rounded-md px-3 text-sm bg-white flex-1 min-w-[240px]">
          <option value="">Selecionar pesquisa...</option>
          {surveys.map(s => <option key={s.id} value={s.id}>{s.title}{s.company_name ? ` — ${s.company_name}` : ''} ({s.climate_responses?.[0]?.count ?? 0})</option>)}
        </select>
        {data && (
          <>
            <Button onClick={analyze} disabled={analyzing || total === 0} className="gap-1.5">
              {analyzing ? <><Loader2 className="w-4 h-4 animate-spin" />Analisando...</> : <><Brain className="w-4 h-4" />Gerar análise IA</>}
            </Button>
            <Button variant="outline" onClick={() => window.print()} className="gap-1.5"><FileDown className="w-4 h-4" />Exportar PDF</Button>
          </>
        )}
      </div>

      {loading && <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}

      {data && (
        <div className="space-y-4">
          {/* Cabeçalho impressão */}
          <div className="hidden print:block mb-2">
            <h1 className="text-lg font-bold">{data.survey.title}</h1>
            <p className="text-sm">{data.survey.company_name || 'Todas as empresas'} — {total} respostas</p>
          </div>

          {/* Indicadores gerais */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border bg-white p-4">
              <Users className="w-4 h-4 text-muted-foreground mb-1" />
              <p className="text-[11px] uppercase text-muted-foreground">Respostas</p>
              <p className="text-2xl font-bold">{total}</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <BarChart3 className="w-4 h-4 text-muted-foreground mb-1" />
              <p className="text-[11px] uppercase text-muted-foreground">Aderência geral</p>
              <p className={`text-2xl font-bold ${tone(mediaGeral)}`}>{mediaGeral}%</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-[11px] uppercase text-muted-foreground">Clima</p>
              <p className={`text-lg font-bold ${tone(mediaGeral)}`}>{mediaGeral >= 70 ? 'Positivo' : mediaGeral >= 50 ? 'Atenção' : 'Crítico'}</p>
            </div>
          </div>

          {/* Por pergunta */}
          <div className="bg-white rounded-xl border p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-3">Aderência por pergunta</h2>
            <div className="space-y-2.5">
              {perQuestion.map((q, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm text-gray-700 flex-1">{q.text}</span>
                    <span className={`text-sm font-bold ${tone(q.aderencia)}`}>{q.aderencia}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${bar(q.aderencia)}`} style={{ width: `${q.aderencia}%` }} />
                  </div>
                </div>
              ))}
              {perQuestion.length === 0 && <p className="text-sm text-muted-foreground">Sem perguntas.</p>}
            </div>
          </div>

          {/* Por funcionário */}
          <div className="bg-white rounded-xl border p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-3">Resultado por funcionário</h2>
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted-foreground uppercase border-b"><th className="text-left py-1.5">Funcionário</th><th className="text-right py-1.5">Aderência</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {perFunc.map((f, i) => (
                  <tr key={i}><td className="py-2 text-gray-700">{f.nome}</td><td className={`py-2 text-right font-semibold ${tone(f.pct)}`}>{f.pct}%</td></tr>
                ))}
                {perFunc.length === 0 && <tr><td colSpan={2} className="py-4 text-center text-muted-foreground">Nenhuma resposta ainda.</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Análise IA */}
          {analysis && (
            <div className="bg-white rounded-xl border p-5">
              <h2 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1.5"><Brain className="w-4 h-4" />Análise da IA</h2>
              <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{analysis}</div>
            </div>
          )}
        </div>
      )}

      {!loading && !data && selectedId === '' && (
        <p className="text-sm text-muted-foreground flex items-center gap-1.5"><AlertCircle className="w-4 h-4" />Selecione uma pesquisa para ver os resultados.</p>
      )}
    </div>
  )
}
