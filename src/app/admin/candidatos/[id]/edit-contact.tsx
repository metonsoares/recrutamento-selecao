'use client'
import { useState, type ElementType } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Check, X, Loader2, Phone, Mail } from 'lucide-react'

interface Props {
  candidateId: string
  initialPhone: string | null
  initialEmail: string | null
  initialCpf?: string | null
  /** Exibe ícones (Telefone/E-mail) no modo leitura — combina com o card do ResumoColaborador */
  withIcons?: boolean
}

/** Máscara progressiva de CPF (000.000.000-00). */
function maskCPF(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

/** Valida CPF pelos dígitos verificadores. */
function validateCPF(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false
  let s = 0
  for (let i = 0; i < 9; i++) s += +d[i] * (10 - i)
  let r1 = (s * 10) % 11; if (r1 >= 10) r1 = 0
  if (r1 !== +d[9]) return false
  s = 0
  for (let i = 0; i < 10; i++) s += +d[i] * (11 - i)
  let r2 = (s * 10) % 11; if (r2 >= 10) r2 = 0
  return r2 === +d[10]
}

/** Exibe CPF mascarado quando tem 11 dígitos; senão mostra o valor como está. */
function formatCpf(v: string | null): string {
  if (!v) return ''
  const d = v.replace(/\D/g, '')
  return d.length === 11 ? maskCPF(d) : v
}

function Row({ icon: Icon, label, value }: { icon?: ElementType; label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground shrink-0 flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5 opacity-60" />}{label}
      </span>
      <span className="text-gray-900 text-right break-all">{value || '—'}</span>
    </div>
  )
}

/** CPF, Telefone e E-mail do candidato, editáveis pelo Master. */
export function EditContact({ candidateId, initialPhone, initialEmail, initialCpf = null, withIcons = false }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [cpf, setCpf] = useState(maskCPF(initialCpf || ''))
  const [phone, setPhone] = useState(initialPhone || '')
  const [email, setEmail] = useState(initialEmail || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const cpfDigits = cpf.replace(/\D/g, '')
  const cpfInvalid = cpfDigits.length > 0 && (cpfDigits.length !== 11 || !validateCPF(cpf))

  async function save() {
    if (cpfInvalid) { setError('CPF inválido. Verifique o campo.'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf, phone, email }),
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
        <Row label="CPF" value={formatCpf(initialCpf)} />
        <Row icon={withIcons ? Phone : undefined} label="Telefone" value={initialPhone} />
        <Row icon={withIcons ? Mail : undefined} label="E-mail" value={initialEmail} />
        <button
          onClick={() => { setCpf(maskCPF(initialCpf || '')); setPhone(initialPhone || ''); setEmail(initialEmail || ''); setError(''); setEditing(true) }}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          <Pencil className="w-3 h-3" />Editar dados
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2 border border-primary/30 rounded-lg p-2.5 bg-primary/5">
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-gray-600">CPF</label>
        <input value={cpf} onChange={e => setCpf(maskCPF(e.target.value))} placeholder="000.000.000-00" inputMode="numeric"
          className={`h-8 w-full border rounded-md px-2.5 text-sm bg-white ${cpfInvalid ? 'border-red-400' : 'border-gray-300'}`} />
        {cpfInvalid && <p className="text-[10px] text-red-600">{cpfDigits.length === 11 ? 'CPF inválido.' : 'CPF incompleto.'}</p>}
      </div>
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
        <button onClick={save} disabled={saving || cpfInvalid}
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
