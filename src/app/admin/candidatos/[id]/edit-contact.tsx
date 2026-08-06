'use client'
import { useState, type ElementType } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Check, X, Loader2, Phone, Mail } from 'lucide-react'

interface Addr { street: string; number: string; complement: string; neighborhood: string; city: string; cep: string }

interface Props {
  candidateId: string
  initialPhone: string | null
  initialEmail: string | null
  initialCpf?: string | null
  /** Passe o nome atual para habilitar a edição do Nome no modal (ausente = não edita nome) */
  initialName?: string | null
  /** Passe o endereço atual (ou null) para habilitar a edição do Endereço no modal */
  initialAddress?: Addr | null
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

/** Máscara progressiva de CEP (00000-000). */
function maskCEP(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 8)
  return d.replace(/(\d{5})(\d{1,3})$/, '$1-$2')
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

/** Campo do modal de edição. */
function EditField({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1 ${className}`}>
      <label className="text-[11px] font-medium text-gray-600">{label}</label>
      {children}
    </div>
  )
}

const INPUT_CLS = 'h-9 w-full border border-gray-300 rounded-md px-2.5 text-sm bg-white'

/**
 * Dados de contato do candidato, editáveis pelo Master via modal.
 * CPF/Telefone/E-mail sempre; Nome e Endereço quando as props correspondentes
 * são passadas. Ao salvar, a Ficha do Funcionário reflete os campos pertinentes
 * (nome/e-mail/telefone são lidos ao vivo do candidato; o endereço é gravado
 * também em admission_form.address_* pela API).
 */
export function EditContact({
  candidateId, initialPhone, initialEmail, initialCpf = null,
  initialName, initialAddress, withIcons = false,
}: Props) {
  const router = useRouter()
  const editableName = initialName !== undefined
  const editableAddress = initialAddress !== undefined
  const emptyAddr: Addr = { street: '', number: '', complement: '', neighborhood: '', city: '', cep: '' }

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(initialName ?? '')
  const [cpf, setCpf] = useState(maskCPF(initialCpf || ''))
  const [phone, setPhone] = useState(initialPhone || '')
  const [email, setEmail] = useState(initialEmail || '')
  const [addr, setAddr] = useState<Addr>(initialAddress ?? emptyAddr)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const cpfDigits = cpf.replace(/\D/g, '')
  const cpfInvalid = cpfDigits.length > 0 && (cpfDigits.length !== 11 || !validateCPF(cpf))

  function open() {
    setName(initialName ?? '')
    setCpf(maskCPF(initialCpf || ''))
    setPhone(initialPhone || '')
    setEmail(initialEmail || '')
    setAddr(initialAddress ?? emptyAddr)
    setError(''); setEditing(true)
  }

  const setA = (k: keyof Addr) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setAddr(a => ({ ...a, [k]: k === 'cep' ? maskCEP(e.target.value) : e.target.value }))

  async function save() {
    if (cpfInvalid) { setError('CPF inválido. Verifique o campo.'); return }
    if (editableName && !name.trim()) { setError('Nome não pode ficar vazio.'); return }
    setSaving(true); setError('')
    try {
      const payload: Record<string, unknown> = { cpf, phone, email }
      if (editableName) payload.full_name = name.trim()
      if (editableAddress) payload.address = addr
      const res = await fetch(`/api/admin/candidatos/${candidateId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.ok) { setError(d.error || 'Erro ao salvar.'); return }
      setEditing(false)
      router.refresh()
    } catch { setError('Erro ao salvar.') } finally { setSaving(false) }
  }

  return (
    <div className="space-y-2">
      <Row label="CPF" value={formatCpf(initialCpf)} />
      <Row icon={withIcons ? Phone : undefined} label="Telefone" value={initialPhone} />
      <Row icon={withIcons ? Mail : undefined} label="E-mail" value={initialEmail} />
      <button
        onClick={open}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
      >
        <Pencil className="w-3 h-3" />Editar dados
      </button>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => { if (!saving) setEditing(false) }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white rounded-t-2xl z-10">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2"><Pencil className="w-4 h-4 text-primary" />Editar dados</h2>
              <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>

            <div className="px-5 py-4 space-y-3">
              {editableName && (
                <EditField label="Nome completo">
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do colaborador" className={INPUT_CLS} />
                </EditField>
              )}
              <EditField label="CPF">
                <input value={cpf} onChange={e => setCpf(maskCPF(e.target.value))} placeholder="000.000.000-00" inputMode="numeric"
                  className={`${INPUT_CLS} ${cpfInvalid ? 'border-red-400' : ''}`} />
                {cpfInvalid && <p className="text-[10px] text-red-600">{cpfDigits.length === 11 ? 'CPF inválido.' : 'CPF incompleto.'}</p>}
              </EditField>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <EditField label="Telefone">
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(24) 99999-9999" className={INPUT_CLS} />
                </EditField>
                <EditField label="E-mail">
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" className={INPUT_CLS} />
                </EditField>
              </div>

              {editableAddress && (
                <div className="space-y-2 pt-2 border-t">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Endereço</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <EditField label="Logradouro" className="sm:col-span-2">
                      <input value={addr.street} onChange={setA('street')} placeholder="Rua, Av., Estrada..." className={INPUT_CLS} />
                    </EditField>
                    <EditField label="Número">
                      <input value={addr.number} onChange={setA('number')} placeholder="123" className={INPUT_CLS} />
                    </EditField>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <EditField label="Complemento">
                      <input value={addr.complement} onChange={setA('complement')} placeholder="Apto, bloco... (opcional)" className={INPUT_CLS} />
                    </EditField>
                    <EditField label="Bairro">
                      <input value={addr.neighborhood} onChange={setA('neighborhood')} placeholder="Bairro" className={INPUT_CLS} />
                    </EditField>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <EditField label="Cidade">
                      <input value={addr.city} onChange={setA('city')} placeholder="Cidade" className={INPUT_CLS} />
                    </EditField>
                    <EditField label="CEP">
                      <input value={addr.cep} onChange={setA('cep')} placeholder="00000-000" inputMode="numeric" className={INPUT_CLS} />
                    </EditField>
                  </div>
                </div>
              )}

              {error && <p className="text-[12px] text-red-600 flex items-center gap-1"><X className="w-3 h-3" />{error}</p>}
            </div>

            <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl sticky bottom-0">
              <button onClick={() => setEditing(false)} disabled={saving}
                className="inline-flex items-center gap-1 text-[13px] font-medium px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 disabled:opacity-60">
                Cancelar
              </button>
              <button onClick={save} disabled={saving || cpfInvalid}
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-60">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
