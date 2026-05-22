'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { STATUS_LABELS, CandidateStatus, BackgroundCheckResult } from '@/types'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { Brain, FlaskConical, Eye, CalendarCheck, Loader2, CheckCircle2, AlertCircle, ShieldCheck, ShieldAlert, Shield, Globe, RefreshCw } from 'lucide-react'
import { formatDateTime } from '@/lib/helpers'

const ALL_STATUSES = (Object.keys(STATUS_LABELS) as CandidateStatus[]).filter(s => s !== 'removido')

// ─── Toast simples ────────────────────────────────────────────────────────────

function Toast({ type, message }: { type: 'success' | 'error'; message: string }) {
  return (
    <div className={[
      'fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium max-w-sm',
      type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white',
    ].join(' ')}>
      {type === 'success'
        ? <CheckCircle2 className="w-4 h-4 shrink-0" />
        : <AlertCircle className="w-4 h-4 shrink-0" />
      }
      {message}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

// ─── Background Check Modal ───────────────────────────────────────────────────

function RiskBadge({ level }: { level: BackgroundCheckResult['nivel_risco'] }) {
  const map: Record<string, { label: string; className: string; Icon: React.ElementType }> = {
    baixo:            { label: 'Risco Baixo',             className: 'bg-emerald-100 text-emerald-800 border-emerald-300', Icon: ShieldCheck },
    medio:            { label: 'Risco Médio',             className: 'bg-amber-100 text-amber-800 border-amber-300',       Icon: Shield },
    alto:             { label: 'Risco Alto',              className: 'bg-red-100 text-red-800 border-red-300',             Icon: ShieldAlert },
    nao_determinado:  { label: 'Não Determinado',         className: 'bg-gray-100 text-gray-700 border-gray-300',          Icon: Shield },
  }
  const cfg = map[level] ?? map.nao_determinado
  const Icon = cfg.Icon
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${cfg.className}`}>
      <Icon className="w-3.5 h-3.5" />
      {cfg.label}
    </span>
  )
}

function BackgroundCheckModal({
  open,
  onClose,
  result,
  checkedAt,
  candidateId,
  onRefresh,
}: {
  open: boolean
  onClose: () => void
  result: BackgroundCheckResult | null
  checkedAt: string | null
  candidateId: string
  onRefresh: (r: BackgroundCheckResult, at: string) => void
}) {
  const [running, setRunning] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function runCheck() {
    setRunning(true)
    setErr(null)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/background-check`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(data?.error || `Erro ${res.status}`)
        return
      }
      onRefresh(data.result as BackgroundCheckResult, new Date().toISOString())
    } catch {
      setErr('Erro de conexão. Tente novamente.')
    } finally {
      setRunning(false)
    }
  }

  const found = result?.processos_judiciais?.encontrado

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6 [word-break:break-word]">
        <DialogHeader className="pb-1">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0" />
            Check de Processos e Antecedentes
          </DialogTitle>
        </DialogHeader>

        {/* Barra de ação */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {checkedAt && (
            <span className="text-xs text-muted-foreground">
              Última verificação: {formatDateTime(checkedAt)}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={runCheck}
            disabled={running}
            className="gap-1.5 w-full sm:w-auto"
          >
            {running
              ? <><Loader2 className="w-4 h-4 animate-spin" />Pesquisando...</>
              : <><RefreshCw className="w-4 h-4" />{result ? 'Refazer pesquisa' : 'Iniciar pesquisa'}</>
            }
          </Button>
        </div>

        {err && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {err}
          </div>
        )}

        {/* Loading sem resultado anterior */}
        {running && !result && (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm font-medium">Consultando JusBrasil e Escavador...</p>
            <p className="text-xs text-center max-w-xs text-gray-500">
              Pesquisando processos por nome e CPF. Pode levar alguns segundos.
            </p>
          </div>
        )}

        {/* Estado vazio */}
        {!result && !running && (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
            <ShieldCheck className="w-12 h-12 text-gray-300" />
            <p className="text-sm font-medium">Nenhuma pesquisa realizada ainda</p>
            <p className="text-xs text-center max-w-xs">
              Clique em &quot;Iniciar pesquisa&quot; para consultar fontes públicas sobre este candidato.
            </p>
          </div>
        )}

        {/* Resultado */}
        {result && (
          <div className="space-y-3">

            {/* Parecer Geral */}
            <div className="rounded-xl border bg-gray-50 p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-gray-800">Parecer Geral</p>
                <div className="shrink-0">
                  <RiskBadge level={result.nivel_risco} />
                </div>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed break-words">{result.parecer_geral}</p>
            </div>

            {/* Processos Judiciais */}
            <div className={`rounded-xl border p-4 space-y-2 ${found ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}>
              <div className="flex items-start gap-2">
                {found
                  ? <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  : <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                }
                <p className={`text-sm font-semibold min-w-0 break-words ${found ? 'text-red-800' : 'text-emerald-800'}`}>
                  Processos Judiciais{' '}
                  {found
                    ? <span>⚠️ Encontrado(s)</span>
                    : <span>✓ Nenhum encontrado</span>
                  }
                </p>
              </div>
              {result.processos_judiciais?.resumo && (
                <p className="text-sm text-gray-700 leading-relaxed break-words">{result.processos_judiciais.resumo}</p>
              )}
              {(result.processos_judiciais?.detalhes || []).length > 0 && (
                <ul className="space-y-1.5 pt-1">
                  {result.processos_judiciais.detalhes.map((d, i) => (
                    <li key={i} className="text-sm flex gap-2 text-red-900 leading-relaxed">
                      <span className="shrink-0 mt-0.5">•</span>
                      <span className="min-w-0 break-words">{typeof d === 'string' ? d : JSON.stringify(d)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {(result.processos_judiciais?.urls || []).length > 0 && (
                <div className="flex flex-col gap-1 pt-1">
                  {result.processos_judiciais.urls.map((u, i) => (
                    <a key={i} href={u.startsWith('http') ? u : `https://${u}`} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-600 underline hover:text-blue-800 flex items-center gap-1 min-w-0">
                      <Globe className="w-3 h-3 shrink-0" />
                      <span className="truncate">{u}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Outras informações */}
            {((result.outras_informacoes?.items || []).length > 0 ||
              (result.outras_informacoes?.resumo && result.outras_informacoes.resumo.trim())) && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-2">
                <p className="text-sm font-semibold text-blue-800">Outras Informações Relevantes</p>
                {result.outras_informacoes?.resumo && (
                  <p className="text-sm text-gray-700 leading-relaxed">{result.outras_informacoes.resumo}</p>
                )}
                {(result.outras_informacoes?.items || []).length > 0 && (
                  <ul className="space-y-1">
                    {result.outras_informacoes.items.map((item, i) => (
                      <li key={i} className="text-sm flex gap-2 text-blue-900">
                        <span className="shrink-0">•</span>{item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Fontes + rodapé */}
            <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-3 space-y-2">
              {(result.fontes_consultadas || []).length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1.5">Fontes consultadas:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.fontes_consultadas.map((f, i) => (
                      <span key={i} className="text-xs bg-white border border-gray-300 text-gray-700 px-2 py-0.5 rounded-full">{f}</span>
                    ))}
                  </div>
                </div>
              )}
              {result.observacoes_tecnicas && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 leading-relaxed break-words">
                  ⚠️ {result.observacoes_tecnicas}
                </p>
              )}
              <p className="text-[11px] text-muted-foreground leading-relaxed border-t pt-2">
                Dados obtidos via <strong>JusBrasil</strong> e <strong>Escavador</strong>. Os resultados devem ser verificados manualmente antes de qualquer decisão.
              </p>
            </div>

          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CandidateActions({
  candidateId,
  applicationId,
  currentStatus,
  cultureTestDone,
  cultureScore,
  cultureAnswersSummary,
  initialBackgroundCheck,
  initialBackgroundCheckAt,
}: {
  candidateId: string
  applicationId?: string
  currentStatus: CandidateStatus
  cultureTestDone?: boolean
  cultureScore?: number | null
  cultureAnswersSummary?: Array<{ question: string; answer: string; score: number }>
  initialBackgroundCheck?: BackgroundCheckResult | null
  initialBackgroundCheckAt?: string | null
}) {
  const router = useRouter()
  const [status, setStatus] = useState(currentStatus)
  const [cultureOpen, setCultureOpen] = useState(false)
  const [bgCheckOpen, setBgCheckOpen] = useState(false)
  const [bgCheckResult, setBgCheckResult] = useState<BackgroundCheckResult | null>(initialBackgroundCheck ?? null)
  const [bgCheckAt, setBgCheckAt] = useState<string | null>(initialBackgroundCheckAt ?? null)
  const [analyzing, setAnalyzing] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  function showToast(type: 'success' | 'error', message: string, durationMs = 4000) {
    setToast({ type, message })
    setTimeout(() => setToast(null), durationMs)
  }

  async function handleStatusChange(newStatus: string | null) {
    if (!newStatus || !applicationId) return
    setStatus(newStatus as CandidateStatus)
    setSavingStatus(true)
    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase
      .from('applications')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', applicationId)
    setSavingStatus(false)
    if (error) {
      showToast('error', 'Erro ao alterar status.')
      setStatus(currentStatus)
    } else {
      router.refresh()
    }
  }

  // ── Analisar IA — dispara e faz polling no Supabase ─────────────────────────
  async function handleAnalyzeAI() {
    if (!applicationId) {
      showToast('error', 'Candidato sem candidatura vinculada.')
      return
    }
    setAnalyzing(true)

    try {
      const res = await fetch('/api/admin/ai/analyze-candidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        showToast('error', data?.error || `Erro ${res.status} ao iniciar análise.`, 8000)
        setAnalyzing(false)
        return
      }

      // Se a rota retornou um erro de etapa específica, mostra para diagnóstico
      if (data?.error) {
        showToast('error', `Erro na etapa "${data.step}": ${data.error}`, 10000)
        setAnalyzing(false)
        return
      }

      // Mostra qual provider foi usado
      const providerLabel = data?.provider === 'anthropic' ? 'Claude (Anthropic)'
        : data?.provider === 'openai' ? 'GPT (OpenAI)'
        : data?.provider === 'fallback' ? 'Fallback (sem chave IA)'
        : 'IA'
      showToast('success', `✅ Análise concluída via ${providerLabel}! Recarregando...`, 5000)

      // Pequena pausa e recarrega — o resultado já está salvo no DB
      await new Promise(r => setTimeout(r, 1500))
      window.location.reload()

    } catch (err) {
      console.error('[analyze] fetch error:', err)
      showToast('error', 'Erro de conexão. Verifique sua internet e tente novamente.', 6000)
      setAnalyzing(false)
    }
  }

  // ── Enviar Teste Cultural ────────────────────────────────────────────────────
  async function handleSendCultureTest() {
    setSendingTest(true)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/send-culture-test`, {
        method: 'POST',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast('error', data?.error || 'Erro ao enviar teste cultural.', 5000)
        return
      }
      setStatus('aguardando_teste_cultural')
      if (data.whatsappSent) {
        showToast('success', '✅ Teste cultural enviado via WhatsApp!', 5000)
      } else {
        const errDetail = data.whatsappError ? ` (${data.whatsappError})` : ''
        showToast('success', `✅ Link do teste gerado! WhatsApp indisponível${errDetail}`, 7000)
      }
      router.refresh()
    } finally {
      setSendingTest(false)
    }
  }

  // ── Agendar Entrevista ──────────────────────────────────────────────────────
  async function handleScheduleInterview() {
    setScheduling(true)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/schedule-interview`, {
        method: 'POST',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast('error', data?.error || 'Erro ao agendar entrevista.', 5000)
        return
      }
      setStatus('entrevista_agendada')
      showToast('success', 'Entrevista agendada! Mensagem enviada via WhatsApp.')
      router.refresh()
    } finally {
      setScheduling(false)
    }
  }

  const scoreColor = (v: number) =>
    v >= 70 ? 'text-emerald-600' : v >= 50 ? 'text-amber-600' : 'text-red-600'

  return (
    <>
      {toast && <Toast type={toast.type} message={toast.message} />}

      <BackgroundCheckModal
        open={bgCheckOpen}
        onClose={() => setBgCheckOpen(false)}
        result={bgCheckResult}
        checkedAt={bgCheckAt}
        candidateId={candidateId}
        onRefresh={(r, at) => { setBgCheckResult(r); setBgCheckAt(at) }}
      />

      <div className="flex gap-2 flex-wrap items-center mt-2">
        {/* Status */}
        {applicationId && (
          <Select value={status} onValueChange={handleStatusChange} disabled={savingStatus}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_STATUSES.map(s => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Analisar IA */}
        {applicationId && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleAnalyzeAI}
            disabled={analyzing}
            className="gap-1"
          >
            {analyzing
              ? <><Loader2 className="w-4 h-4 animate-spin" />Analisando...</>
              : <><Brain className="w-4 h-4" />Analisar IA</>
            }
          </Button>
        )}

        {/* Teste Cultural — Enviar ou Visualizar */}
        {applicationId && (
          cultureTestDone ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCultureOpen(true)}
                className="gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              >
                <Eye className="w-4 h-4" />
                Visualizar Teste Cultural
              </Button>

              {/* Dialog de resultados */}
              <Dialog open={cultureOpen} onOpenChange={setCultureOpen}>
                <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Teste Cultural</DialogTitle>
                  </DialogHeader>

                  {/* Score geral */}
                  {cultureScore != null && (
                    <div className="flex items-center gap-4 p-3 rounded-lg bg-gray-50 border mb-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Compatibilidade Cultural</p>
                        <p className={`text-3xl font-bold ${scoreColor(cultureScore)}`}>
                          {Math.round(cultureScore)}%
                        </p>
                      </div>
                      <div className="flex-1">
                        <div className="w-full h-2 rounded-full bg-gray-200 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${cultureScore >= 70 ? 'bg-emerald-500' : cultureScore >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
                            style={{ width: `${cultureScore}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {cultureScore >= 70 ? 'Alta compatibilidade' : cultureScore >= 50 ? 'Compatibilidade moderada' : 'Baixa compatibilidade'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Respostas */}
                  <div className="space-y-3">
                    {(cultureAnswersSummary || []).map((a, i) => (
                      <div key={i} className="text-sm border-b pb-2 last:border-0">
                        <p className="text-xs text-muted-foreground">{a.question}</p>
                        <div className="flex items-center justify-between mt-0.5 gap-2">
                          <p className="font-medium">{a.answer}</p>
                          <span className={`text-xs font-bold shrink-0 ${scoreColor(a.score * 10)}`}>
                            {a.score}/10
                          </span>
                        </div>
                      </div>
                    ))}
                    {(!cultureAnswersSummary || cultureAnswersSummary.length === 0) && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nenhuma resposta registrada.
                      </p>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSendCultureTest}
              disabled={sendingTest}
              className="gap-1"
            >
              {sendingTest
                ? <><Loader2 className="w-4 h-4 animate-spin" />Enviando...</>
                : <><FlaskConical className="w-4 h-4" />Enviar Teste Cultural</>
              }
            </Button>
          )
        )}

        {/* Check Processos */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setBgCheckOpen(true)}
          className={`gap-1 ${bgCheckResult
            ? bgCheckResult.nivel_risco === 'alto'
              ? 'border-red-300 text-red-700 hover:bg-red-50'
              : bgCheckResult.nivel_risco === 'medio'
                ? 'border-amber-300 text-amber-700 hover:bg-amber-50'
                : 'border-blue-300 text-blue-700 hover:bg-blue-50'
            : 'border-blue-200 text-blue-700 hover:bg-blue-50'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Check Processos
          {bgCheckResult && (
            <span className={`ml-1 text-[10px] font-bold px-1 py-0.5 rounded-full ${
              bgCheckResult.nivel_risco === 'alto'    ? 'bg-red-100 text-red-700'    :
              bgCheckResult.nivel_risco === 'medio'   ? 'bg-amber-100 text-amber-700':
              bgCheckResult.nivel_risco === 'baixo'   ? 'bg-emerald-100 text-emerald-700' :
                                                        'bg-gray-100 text-gray-600'
            }`}>
              {bgCheckResult.nivel_risco === 'alto'   ? '⚠ ALTO'   :
               bgCheckResult.nivel_risco === 'medio'  ? '! MÉDIO'  :
               bgCheckResult.nivel_risco === 'baixo'  ? '✓ BAIXO'  : '?'}
            </span>
          )}
        </Button>

        {/* Agendar Entrevista */}
        {status === 'apto_para_entrevista' && (
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
            onClick={handleScheduleInterview}
            disabled={scheduling}
          >
            {scheduling
              ? <><Loader2 className="w-4 h-4 animate-spin" />Agendando...</>
              : <><CalendarCheck className="w-4 h-4" />Agendar Entrevista</>
            }
          </Button>
        )}

      </div>
    </>
  )
}
