'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { STATUS_LABELS, CandidateStatus } from '@/types'
import { Loader2, AlertCircle } from 'lucide-react'

const ALLOWED_STATUSES: CandidateStatus[] = [
  'novo', 'apto_para_entrevista', 'entrevista_agendada',
  'aprovado_processo', 'aprovado_barraca', 'aprovado_carrinho', 'contratado',
  'aprovado', 'em_contrato', 'freelancer', 'reprovado', 'desligado',
]
const STATUS_LABEL_OVERRIDE: Partial<Record<CandidateStatus, string>> = {
  novo: 'Novo currículo',
  aprovado: 'Intermitente',
}
function statusOptionLabel(s: CandidateStatus) { return STATUS_LABEL_OVERRIDE[s] || STATUS_LABELS[s] }

/**
 * Seletor de status independente — para perfis que têm a permissão
 * `candidatos.status` mas não são master (ex.: RH, Recrutador, Gestor),
 * que não veem o painel completo de ações.
 */
export function StatusSelect({ applicationId, currentStatus }: { applicationId?: string; currentStatus: CandidateStatus }) {
  const router = useRouter()
  const [status, setStatus] = useState<CandidateStatus>(currentStatus)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  if (!applicationId) return null

  async function handleChange(newStatus: string | null) {
    if (!newStatus || !applicationId) return
    setStatus(newStatus as CandidateStatus)
    setSaving(true); setErr('')
    try {
      const res = await fetch(`/api/admin/applications/${applicationId}/status`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.ok) { setErr(d.error || 'Erro ao alterar status.'); setStatus(currentStatus) }
      else router.refresh()
    } catch {
      setErr('Erro ao alterar status.'); setStatus(currentStatus)
    } finally { setSaving(false) }
  }

  return (
    <div className="flex items-center gap-2 mt-2">
      <Select value={status} onValueChange={handleChange} disabled={saving}>
        <SelectTrigger className="w-[200px]">
          {saving ? <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Salvando...</span> : <SelectValue />}
        </SelectTrigger>
        <SelectContent>
          {(ALLOWED_STATUSES.includes(status) ? ALLOWED_STATUSES : [status, ...ALLOWED_STATUSES]).map(s => (
            <SelectItem key={s} value={s}>{statusOptionLabel(s)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {err && <span className="text-[11px] text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{err}</span>}
    </div>
  )
}
