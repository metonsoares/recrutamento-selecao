'use client'
import { useState, useEffect, useCallback } from 'react'
import { BarChart3, Loader2, Brain, FileDown, Users, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SurveyLite { id: string; title: string; company_name: string | null; climate_responses?: { count: number }[] }
interface QOption { text: string; weight: number }
interface Question { id: string; text: string; type?: 'texto' | 'multipla'; options: QOption[] }
interface ResponseRow { id: string; candidate_id: string | null; total_score: number | null; max_score: number | null; answers: Record<string, number | string>; created_at: string }

interface Props { surveys: SurveyLite[]; initialSurveyId?: string }

export function ResultadosManager({ surveys, initialSurveyId }: Props) {
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<{ survey: { title: string; company_name: string | null; questions: Question[] }; responses: ResponseRow[]; nameMap: Record<string, string> } | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [respAnalysis, setRespAnalysis] = useState<Record<string, string>>({})
  const [analyzingResp, setAnalyzingResp] = useState<Record<string, boolean>>({})
  const [summaries, setSummaries] = useState<Record<string, string>>({})
  const [loadingSummaries, setLoadingSummaries] = useState(false)

  const load = useCallback(async (id: string) => {
    setSelectedId(id); setData(null); setAnalysis(''); setExpanded(new Set()); setRespAnalysis({}); setAnalyzingResp({}); setSummaries({})
    if (!id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/climate-surveys/${id}/responses`)
      const json = await res.json()
      if (res.ok) {
        setData(json)
        // Gera resumos curtos por funcionário em paralelo
        const resps: ResponseRow[] = json.responses || []
        if (resps.length) {
          setLoadingSummaries(true)
          Promise.all(resps.map(async r => {
            try {
              const sr = await fetch(`/api/admin/climate-surveys/${id}/summary`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ responseId: r.id }),
              })
              const sj = await sr.json()
              if (sj.summary) setSummaries(p => ({ ...p, [r.id]: sj.summary }))
            } catch { /* ignora */ }
          })).finally(() => setLoadingSummaries(false))
        }
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { if (initialSurveyId) load(initialSurveyId) }, [initialSurveyId, load])

  function toggleExpand(id: string) { setExpanded(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }

  async function analyzeResponse(responseId: string) {
    if (!selectedId) return
    setAnalyzingResp(p => ({ ...p, [responseId]: true }))
    try {
      const res = await fetch(`/api/admin/climate-surveys/${selectedId}/analyze-response`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ responseId }),
      })
      const json = await res.json()
      setRespAnalysis(p => ({ ...p, [responseId]: json.analysis || json.error || 'Sem análise.' }))
    } finally { setAnalyzingResp(p => ({ ...p, [responseId]: false })) }
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
      const raw = r.answers?.[q.id]
      const idx = typeof raw === 'number' ? raw : Number(raw)
      if (raw != null && Number.isInteger(idx) && q.options[idx]) { soma += Number(q.options[idx].weight) || 0; n++ }
    }
    const media = n ? soma / n : 0
    return { text: q.text, aderencia: maxW ? Math.round((media / maxW) * 100) : 0 }
  })
  const mediaGeral = perQuestion.length ? Math.round(perQuestion.reduce((s, q) => s + q.aderencia, 0) / perQuestion.length) : 0

  function respName(r: ResponseRow) { return r.candidate_id ? (data?.nameMap[r.candidate_id] || 'Identificado') : 'Anônimo' }
  function respPct(r: ResponseRow) { return r.max_score ? Math.round(((r.total_score || 0) / r.max_score) * 100) : 0 }

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
            <div className="space-y-2">
              {responses.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma resposta ainda.</p>}
              {responses.map(r => {
                const isOpen = expanded.has(r.id)
                const pct = respPct(r)
                return (
                  <div key={r.id} className="rounded-lg border overflow-hidden">
                    <button onClick={() => toggleExpand(r.id)} className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 text-left print:hover:bg-transparent">
                      {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 print:hidden" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0 print:hidden" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{respName(r)}</p>
                        {summaries[r.id]
                          ? <p className="text-[12px] text-primary truncate">{summaries[r.id]}</p>
                          : loadingSummaries ? <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Resumindo...</p> : null}
                      </div>
                      <span className={`text-sm font-bold shrink-0 ${tone(pct)}`}>{pct}%</span>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 pt-1 space-y-3 border-t bg-gray-50/40">
                        {/* Respostas detalhadas */}
                        <div className="space-y-1.5 pt-2">
                          {questions.map((q, qi) => {
                            const a = r.answers?.[q.id]
                            let resposta = '(não respondida)'
                            if (q.type === 'texto') resposta = a ? String(a) : '(em branco)'
                            else {
                              const idx = typeof a === 'number' ? a : Number(a)
                              const opt = q.options?.[idx]
                              resposta = opt ? `${opt.text} (peso ${opt.weight})` : '(não respondida)'
                            }
                            return (
                              <div key={q.id} className="text-[13px]">
                                <p className="text-gray-600">{qi + 1}. {q.text}</p>
                                <p className="text-gray-900 font-medium pl-3">↳ {resposta}</p>
                              </div>
                            )
                          })}
                        </div>
                        {/* Análise individual IA */}
                        <div className="print:hidden">
                          <Button size="sm" variant="outline" onClick={() => analyzeResponse(r.id)} disabled={analyzingResp[r.id]} className="gap-1.5 h-7">
                            {analyzingResp[r.id] ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Analisando...</> : <><Brain className="w-3.5 h-3.5" />Interpretar com IA</>}
                          </Button>
                        </div>
                        {respAnalysis[r.id] && (
                          <div className="bg-white rounded-lg border p-3">
                            <p className="text-xs font-bold text-gray-900 mb-1 flex items-center gap-1.5"><Brain className="w-3.5 h-3.5" />Análise individual</p>
                            <div className="text-[13px] text-gray-700 whitespace-pre-wrap leading-relaxed">{respAnalysis[r.id]}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
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
