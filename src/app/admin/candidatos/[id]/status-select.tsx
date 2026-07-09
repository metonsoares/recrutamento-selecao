'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { STATUS_LABELS, CandidateStatus } from '@/types'
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'

const ALLOWED_STATUSES: CandidateStatus[] = [
  'novo', 'apto_para_entrevista', 'entrevista_agendada',
  'aprovado_processo', 'contratado',
  'aprovado', 'em_contrato', 'freelancer', 'reprovado', 'desligado',
]
const STATUS_LABEL_OVERRIDE: Partial<Record<CandidateStatus, string>> = {
  novo: 'Novo currículo',
  aprovado: 'Intermitente',
}
function statusOptionLabel(s: CandidateStatus) { return STATUS_LABEL_OVERRIDE[s] || STATUS_LABELS[s] }

/**
 * Seletor de status independente — para perfis que têm a permissão
 * `candidatos.status` mas não são master (ex.: RH, Gestor), que não veem o
 * painel completo de ações. O dropdown só altera o rascunho; salvar é explícito.
 */
export function StatusSelect({ applicationId, currentStatus }: { applicationId?: string; currentStatus: CandidateStatus }) {
  const router = useRouter()
  const [status, setStatus] = useState<CandidateStatus>(currentStatus)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  if (!applicationId) return null

  async function handleSave() {
    if (!applicationId || status === currentStatus) return
    setSaving(true); setErr('')
    try {
      const res = await fetch(`/api/admin/applications/${applicationId}/status`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.ok) { setErr(d.error || 'Erro ao alterar status.'); setStatus(currentStatus) }
      else router.refresh()
    } catch {
      setErr('Erro ao alterar status.'); setStatus(currentStatus)
    } finally { setSaving(false) }
  }

  return (
    <div className="flex items-center gap-2 mt-2 flex-wrap">
      <span className="text-sm font-medium text-gray-600">Alterar status:</span>
      <Select value={status} onValueChange={v => v && setStatus(v as CandidateStatus)} disabled={saving}>
        <SelectTrigger className="w-[200px]">
          <span>{statusOptionLabel(status)}</span>
        </SelectTrigger>
        <SelectContent>
          {(ALLOWED_STATUSES.includes(status) ? ALLOWED_STATUSES : [status, ...ALLOWED_STATUSES]).map(s => (
            <SelectItem key={s} value={s}>{statusOptionLabel(s)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" onClick={handleSave} disabled={saving || status === currentStatus} className="gap-1.5">
        {saving
          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Salvando...</>
          : <><CheckCircle2 className="w-3.5 h-3.5" />Salvar</>}
      </Button>
      {err && <span className="text-[11px] text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{err}</span>}
    </div>
  )
}
