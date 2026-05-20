'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { STATUS_LABELS, CandidateStatus } from '@/types'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { Brain, StickyNote, CalendarCheck, Trash2, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

const ALL_STATUSES = Object.keys(STATUS_LABELS) as CandidateStatus[]

// ─── Toast simples ────────────────────────────────────────────────────────────

function Toast({ type, message }: { type: 'success' | 'error'; message: string }) {
  return (
    <div className={[
      'fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium',
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
}: {
  candidateId: string
  applicationId?: string
  currentStatus: CandidateStatus
}) {
  const router = useRouter()
  const [status, setStatus] = useState(currentStatus)
  const [note, setNote] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
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

  async function handleAddNote() {
    if (!note.trim()) return
    const supabase = createSupabaseBrowserClient()
    await supabase.from('admin_notes').insert({
      candidate_id: candidateId,
      application_id: applicationId || null,
      note: note.trim(),
    })
    setNote('')
    setNoteOpen(false)
    router.refresh()
  }

  // ── Analisar IA ─────────────────────────────────────────────────────────────
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

      // A análise roda em background no servidor (evita timeout do Vercel)
      // Aguardamos ~20s e recarregamos a página com os resultados
      showToast('success', '⏳ Analisando com IA... a página será atualizada em instantes.', 22000)

      await new Promise(r => setTimeout(r, 20000))
      window.location.reload()
    } catch (err) {
      console.error('[analyze] fetch error:', err)
      showToast('error', 'Erro de conexão. Verifique sua internet e tente novamente.', 6000)
      setAnalyzing(false)
    }
    // Nota: setAnalyzing(false) não é chamado aqui intencionalmente —
    // a página recarrega antes via window.location.reload()
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

        {/* Observação via dialog (legacy — mantido) */}
        <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
          <DialogTrigger>
            <Button variant="outline" size="sm" className="gap-1">
              <StickyNote className="w-4 h-4" />
              Observação
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Observação</DialogTitle>
            </DialogHeader>
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Escreva sua observação aqui..."
              rows={4}
            />
            <Button onClick={handleAddNote} disabled={!note.trim()}>
              Salvar
            </Button>
          </DialogContent>
        </Dialog>

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
