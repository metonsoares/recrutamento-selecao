'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Check, X, Loader2 } from 'lucide-react'

interface Props {
  candidateId: string
  initialPhone: string | null
  initialEmail: string | null
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-gray-900 text-right break-all">{value || '—'}</span>
    </div>
  )
}

/** Telefone + E-mail do candidato, editáveis pelo Master. */
export function EditContact({ candidateId, initialPhone, initialEmail }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [phone, setPhone] = useState(initialPhone || '')
  const [email, setEmail] = useState(initialEmail || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, email }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.ok) { setError(d.error || 'Erro ao salvar.'); return }
      setEditing(false)
      router.refresh()
    } catch { setError('Erro ao salvar.') } finally { setSaving(false) }
  }

  if (!editing) {
    return (
      <div className="space-y-2">
        <Row label="Telefone" value={initialPhone} />
        <Row label="E-mail" value={initialEmail} />
        <button
          onClick={() => { setPhone(initialPhone || ''); setEmail(initialEmail || ''); setError(''); setEditing(true) }}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          <Pencil className="w-3 h-3" />Editar contato
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2 border border-primary/30 rounded-lg p-2.5 bg-primary/5">
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-gray-600">Telefone</label>
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(24) 99999-9999"
          className="h-8 w-full border border-gray-300 rounded-md px-2.5 text-sm bg-white" />
      </div>
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-gray-600">E-mail</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com"
          className="h-8 w-full border border-gray-300 rounded-md px-2.5 text-sm bg-white" />
      </div>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
      <div className="flex gap-2 pt-0.5">
        <button onClick={save} disabled={saving}
          className="inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-md bg-primary text-primary-foreground disabled:opacity-60">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Salvar
        </button>
        <button onClick={() => { setEditing(false); setError('') }} disabled={saving}
          className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-md border border-gray-300 text-gray-600">
          <X className="w-3.5 h-3.5" />Cancelar
        </button>
      </div>
    </div>
  )
}
