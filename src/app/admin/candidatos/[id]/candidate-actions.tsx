'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { STATUS_LABELS, CandidateStatus } from '@/types'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { Brain, FlaskConical, Eye, CalendarCheck, Trash2, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

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

export function CandidateActions({
  candidateId,
  applicationId,
  currentStatus,
  cultureTestDone,
  cultureScore,
  cultureAnswersSummary,
}: {
  candidateId: string
  applicationId?: string
  currentStatus: CandidateStatus
  cultureTestDone?: boolean
  cultureScore?: number | null
  cultureAnswersSummary?: Array<{ question: string; answer: string; score: number }>
}) {
  const router = useRouter()
  const [status, setStatus] = useState(currentStatus)
  const [cultureOpen, setCultureOpen] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
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
        showToast('error', data?.error || `Erro ${res.status} ao iniciar análise.`, 6000)
        setAnalyzing(false)
        return
      }

      showToast('success', '⏳ Análise iniciada — aguardando resultado...', 60000)

      // Poll Supabase a cada 3s até ai_summary aparecer (máximo 45s)
      const supabase = createSupabaseBrowserClient()
      const maxWait = 45_000
      const pollInterval = 3_000
      const startedAt = Date.now()

      while (Date.now() - startedAt < maxWait) {
        await new Promise(r => setTimeout(r, pollInterval))
        const { data: app } = await supabase
          .from('applications')
          .select('ai_summary')
          .eq('id', applicationId)
          .single()

        if (app?.ai_summary) {
          window.location.reload()
          return
        }
      }

      // Tempo esgotado — recarrega mesmo assim (pode ter salvado fallback)
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
      showToast(
        'success',
        data.whatsappSent
          ? '✅ Teste cultural enviado via WhatsApp!'
          : '✅ Link do teste gerado! (WhatsApp indisponível)',
        5000,
      )
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

  // ── Remover candidato ───────────────────────────────────────────────────────
  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast('error', data?.error || 'Erro ao remover candidato.', 5000)
        setDeleting(false)
        return
      }
      router.push('/admin/candidatos')
    } finally {
      setDeleting(false)
    }
  }

  const scoreColor = (v: number) =>
    v >= 70 ? 'text-emerald-600' : v >= 50 ? 'text-amber-600' : 'text-red-600'

  return (
    <>
      {toast && <Toast type={toast.type} message={toast.message} />}

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

        {/* Remover */}
        {!confirmDelete ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-red-500 hover:text-red-700 hover:bg-red-50 ml-auto gap-1"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="w-4 h-4" />
            Remover Currículo
          </Button>
        ) : (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-red-600 font-medium">Confirmar remoção permanente?</span>
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sim, remover'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
          </div>
        )}
      </div>
    </>
  )
}
