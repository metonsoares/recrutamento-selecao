'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { STATUS_LABELS, CandidateStatus } from '@/types'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { Brain, StickyNote, CalendarCheck, Trash2, Loader2 } from 'lucide-react'

const ALL_STATUSES = Object.keys(STATUS_LABELS) as CandidateStatus[]

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
  const [saving, setSaving] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleStatusChange(newStatus: string | null) {
    if (!newStatus) return
    if (!applicationId) return
    setStatus(newStatus as CandidateStatus)
    const supabase = createSupabaseBrowserClient()
    await supabase.from('applications').update({ status: newStatus }).eq('id', applicationId)
    router.refresh()
  }

  async function handleAddNote() {
    if (!note.trim()) return
    setSaving(true)
    const supabase = createSupabaseBrowserClient()
    await supabase.from('admin_notes').insert({
      candidate_id: candidateId,
      application_id: applicationId || null,
      note: note.trim(),
    })
    setNote('')
    setNoteOpen(false)
    setSaving(false)
    router.refresh()
  }

  async function handleAnalyzeAI() {
    if (!applicationId) return
    setAnalyzing(true)
    try {
      await fetch(`/api/admin/ai/analyze-candidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId }),
      })
      router.refresh()
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleScheduleInterview() {
    setScheduling(true)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/schedule-interview`, {
        method: 'POST',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || 'Erro ao agendar entrevista.')
        return
      }
      setStatus('entrevista_agendada')
      router.refresh()
    } finally {
      setScheduling(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || 'Erro ao remover candidato.')
        setDeleting(false)
        return
      }
      router.push('/admin/candidatos')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex gap-2 flex-wrap items-center">
      {applicationId && (
        <Select value={status} onValueChange={handleStatusChange}>
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

      {applicationId && (
        <Button variant="outline" size="sm" onClick={handleAnalyzeAI} disabled={analyzing}>
          <Brain className="w-4 h-4 mr-1" />
          {analyzing ? 'Analisando...' : 'Analisar IA'}
        </Button>
      )}

      {/* Agendar Entrevista — visível quando apto */}
      {status === 'apto_para_entrevista' && (
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={handleScheduleInterview}
          disabled={scheduling}
        >
          {scheduling
            ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Agendando...</>
            : <><CalendarCheck className="w-4 h-4 mr-1" />Agendar Entrevista</>
          }
        </Button>
      )}

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogTrigger>
          <Button variant="outline" size="sm">
            <StickyNote className="w-4 h-4 mr-1" />
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
          <Button onClick={handleAddNote} disabled={saving || !note.trim()}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Remover currículo */}
      {!confirmDelete ? (
        <Button
          variant="ghost"
          size="sm"
          className="text-red-500 hover:text-red-700 hover:bg-red-50 ml-auto"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="w-4 h-4 mr-1" />
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
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmDelete(false)}
          >
            Cancelar
          </Button>
        </div>
      )}
    </div>
  )
}
