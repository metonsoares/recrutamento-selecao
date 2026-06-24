'use client'
import { useState, useRef } from 'react'
import {
  Loader2, Save, CheckCircle2, AlertCircle, Search,
  Upload, X, FileText, ImageIcon, Clock, Eye, Download,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDateTime } from '@/lib/helpers'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface UploadedFile {
  url: string
  name: string
  path: string
}

export interface DocState {
  not_applicable: boolean
  files: UploadedFile[]
}

export interface AdmissionFormData {
  selected_company_id: string
  cpf_value: string
  address_street: string
  address_number: string
  address_complement: string
  address_bairro: string
  address_city: string
  address_cep: string
  phone_landline: string
  pis: string
  pis_date: string
  identity_number: string
  identity_date: string
  marital_status: string
  education: string
  union_dues: boolean | null
  transport_benefit: boolean | null
  function_title: string
  salary: string
  admission_date: string
  trial_contract: string
  docs: Record<string, DocState>
  children_count: string
  alimony: boolean | null
  transport_company: string
  transport_count: string
  notes: string
}

export interface CandidateAddress {
  street: string; number: string; complement: string
  neighborhood: string; city: string; cep: string
}

interface Candidate {
  id: string; full_name: string; phone: string | null; email: string | null
  cpf: string | null; city: string | null; neighborhood: string | null
  address: CandidateAddress | null
}

export interface CompanyOption {
  id: string
  apelido: string | null
  razao_social: string | null
  cnpj: string | null
}

interface Props {
  candidate: Candidate; jobTitle: string | null; companyName: string | null
  initialData: AdmissionFormData | null
  companies: CompanyOption[]
  docRequestDates?: Record<string, string>
}

// ─── Docs definition ──────────────────────────────────────────────────────────

const ALL_DOCS = [
  { key: 'carteira_profissional',      label: 'Carteira Profissional (folhas de identificação e qualificação)' },
  { key: 'foto_3x4',                   label: '01 Foto 3 × 4' },
  { key: 'atestado_admissional',       label: 'Atestado Admissional (Médico do Trabalho)' },
  { key: 'cartao_pis',                 label: 'Cartão de Inscrição no PIS' },
  { key: 'cpf',                        label: 'CPF' },
  { key: 'identidade',                 label: 'Carteira de Identidade (RG)' },
  { key: 'titulo_eleitor',             label: 'Título de Eleitor' },
  { key: 'certificado_reservista',     label: 'Certificado de Reservista' },
  { key: 'comprovante_escolaridade',   label: 'Comprovante de Escolaridade' },
  { key: 'certidao_civil',             label: 'Certidão de Nascimento / Casamento / outros' },
  { key: 'comprovante_residencia',     label: 'Comprovante de Residência' },
  { key: 'certidao_nascimento_filhos', label: 'Certidão de Nascimento dos filhos', perChild: true },
  { key: 'cpf_dependentes',            label: 'CPF dos dependentes', perChild: true },
  { key: 'carteira_vacinacao',         label: 'Carteira de Vacinação (filhos)', perChild: true },
  { key: 'declaracao_escolar',         label: 'Declaração Escolar dos filhos', perChild: true },
  { key: 'pensao_alimenticia',         label: 'Decisão Judicial – Pensão Alimentícia' },
]

const MARITAL = ['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União Estável', 'Separado(a)']
const EDUCATION = ['Fundamental Incompleto', 'Fundamental Completo', 'Médio Incompleto', 'Médio Completo', 'Superior Incompleto', 'Superior Completo', 'Pós-graduação']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function maskCPF(v: string) {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}
function validateCPF(cpf: string) {
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false
  const calc = (n: number) => {
    let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i)
    const r = (s * 10) % 11; return r >= 10 ? 0 : r
  }
  return calc(9) === +d[9] && calc(10) === +d[10]
}

/** Máscara de moeda BR: digita "300000" → "R$ 3.000,00". */
function maskBRL(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  return (Number(digits) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function maskPIS(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 8) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 10) return `${d.slice(0, 3)}.${d.slice(3, 8)}.${d.slice(8)}`
  return `${d.slice(0, 3)}.${d.slice(3, 8)}.${d.slice(8, 10)}-${d.slice(10)}`
}

function emptyDoc(): DocState {
  return { not_applicable: false, files: [] }
}

function makeEmpty(c: Candidate, jobTitle: string | null): AdmissionFormData {
  const addr = c.address
  const rawCpf = c.cpf?.replace(/\D/g, '') ?? ''
  return {
    selected_company_id: '',
    cpf_value: rawCpf ? maskCPF(rawCpf) : '',
    address_street: addr?.street || '', address_number: addr?.number || '',
    address_complement: addr?.complement || '', address_bairro: addr?.neighborhood || c.neighborhood || '',
    address_city: addr?.city || c.city || '', address_cep: addr?.cep || '',
    phone_landline: '', pis: '', pis_date: '',
    identity_number: '', identity_date: '', marital_status: '', education: '',
    union_dues: null, transport_benefit: null,
    function_title: jobTitle || '', salary: '', admission_date: '', trial_contract: '45 + 45 dias',
    docs: Object.fromEntries(ALL_DOCS.map(d => [d.key, emptyDoc()])),
    children_count: '0', alimony: false,
    transport_company: '', transport_count: '', notes: '',
  }
}

function migrateData(data: AdmissionFormData, c: Candidate, jobTitle: string | null): AdmissionFormData {
  const base = makeEmpty(c, jobTitle)
  const docs: Record<string, DocState> = {}
  for (const d of ALL_DOCS) {
    const saved = data.docs?.[d.key]
    if (!saved) { docs[d.key] = emptyDoc(); continue }
    if (typeof saved === 'boolean') {
      docs[d.key] = { not_applicable: false, files: [] }
    } else {
      docs[d.key] = { not_applicable: saved.not_applicable ?? false, files: saved.files ?? [] }
    }
  }
  return { ...base, ...data, cpf_value: data.cpf_value || base.cpf_value, docs }
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1 ${className}`}>
      <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</label>
      {children}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mt-6 mb-3">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400 whitespace-nowrap">{children}</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  )
}

function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="flex gap-3">
      {[true, false].map(v => (
        <label key={String(v)} className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" checked={value === v} onChange={() => onChange(v)} className="accent-primary" />
          <span className="text-sm">{v ? 'Sim' : 'Não'}</span>
        </label>
      ))}
    </div>
  )
}

// ─── Doc Row ──────────────────────────────────────────────────────────────────

function WppIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} fill-current`} aria-hidden>
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.59 5.301l-.999 3.648 3.909-1.748zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413z"/>
    </svg>
  )
}

function DocRow({
  docDef, state, onChange, candidateId, childrenCount, initialRequestedAt,
}: {
  docDef: typeof ALL_DOCS[number]
  state: DocState
  onChange: (s: DocState) => void
  candidateId: string
  childrenCount: number
  initialRequestedAt?: string | null
}) {
  const fileRefs = useRef<(HTMLInputElement | null)[]>([])
  const [uploading, setUploading] = useState<number | null>(null)
  const [uploadError, setUploadError] = useState('')
  const [reqState, setReqState] = useState<'idle' | 'sending'>('idle')
  const [reqError, setReqError] = useState('')
  const [requestedAt, setRequestedAt] = useState<string | null>(initialRequestedAt ?? null)

  async function requestViaWhatsApp() {
    setReqState('sending'); setReqError('')
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/doc-request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_key: docDef.key, doc_label: docDef.label }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.ok) throw new Error(d.error || 'Erro ao enviar solicitação.')
      setRequestedAt((d.last_requested_at as string) || new Date().toISOString())
    } catch (e) {
      setReqError((e as Error).message || 'Erro ao enviar solicitação.')
    } finally {
      setReqState('idle')
    }
  }

  const slots = docDef.perChild ? Math.max(1, childrenCount) : 1
  const isNA = state.not_applicable
  const files = state.files ?? []

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>, slotIdx: number) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError('')

    if (file.size > 4 * 1024 * 1024) {
      setUploadError('Arquivo excede 4 MB')
      return
    }
    const allowed = ['application/pdf', 'image/jpeg', 'image/png']
    if (!allowed.includes(file.type)) {
      setUploadError('Use PDF, JPG ou PNG')
      return
    }

    setUploading(slotIdx)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('docKey', docDef.key)

    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/admission-docs`, {
        method: 'POST', body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      // replaces slot if already exists, else appends
      const newFiles = [...files]
      newFiles[slotIdx] = { url: data.url, name: file.name, path: data.path }
      onChange({ ...state, files: newFiles })
    } catch (err) {
      setUploadError((err as Error).message || 'Erro no upload')
    } finally {
      setUploading(null)
      if (e.target) e.target.value = ''
    }
  }

  async function handleRemove(slotIdx: number) {
    const f = files[slotIdx]
    if (f?.path) {
      await fetch(`/api/admin/candidatos/${candidateId}/admission-docs`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: f.path }),
      }).catch(() => {})
    }
    const newFiles = [...files]
    newFiles.splice(slotIdx, 1)
    onChange({ ...state, files: newFiles })
  }

  // Overall status
  let overallStatus: 'na' | 'done' | 'pending'
  if (isNA) overallStatus = 'na'
  else if (files.filter(Boolean).length >= slots) overallStatus = 'done'
  else overallStatus = 'pending'

  return (
    <div className={`rounded-xl border p-3 transition-all ${isNA ? 'bg-gray-50 border-gray-200' : overallStatus === 'done' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50/50 border-amber-200'}`}>
      {/* Header row */}
      <div className="flex items-start gap-2 flex-wrap">
        {/* Status badge */}
        <span className={`shrink-0 mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
          isNA        ? 'bg-gray-200 text-gray-500' :
          overallStatus === 'done' ? 'bg-emerald-100 text-emerald-700' :
                       'bg-amber-100 text-amber-700'
        }`}>
          {isNA ? 'N/A' : overallStatus === 'done' ? <><CheckCircle2 className="w-2.5 h-2.5" />Entregue</> : <><Clock className="w-2.5 h-2.5" />Pendente</>}
        </span>

        {/* Label */}
        <span className={`flex-1 text-sm font-medium leading-snug ${isNA ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
          {docDef.label}
          {docDef.perChild && childrenCount > 1 && <span className="ml-1 text-[10px] text-muted-foreground font-normal">({childrenCount} filhos)</span>}
        </span>

        {/* N/A checkbox */}
        <label className="flex items-center gap-1 text-[11px] text-gray-500 cursor-pointer shrink-0">
          <input type="checkbox" checked={isNA} onChange={e => onChange({ ...state, not_applicable: e.target.checked })} className="accent-gray-400" />
          Não aplicável
        </label>
      </div>

      {/* Upload slots */}
      {!isNA && (
        <div className="mt-2 space-y-1.5">
          {Array.from({ length: slots }, (_, i) => {
            const uploaded = files[i]
            const viewUrl = uploaded ? `/api/img?u=${encodeURIComponent(uploaded.url)}` : ''
            const dlUrl = uploaded ? `${viewUrl}&dl=1&name=${encodeURIComponent(uploaded.name)}` : ''
            return (
              <div key={i} className="flex items-center gap-2 flex-wrap">
                {docDef.perChild && childrenCount > 1 && (
                  <span className="text-[10px] text-muted-foreground shrink-0 w-12">Filho {i + 1}</span>
                )}
                {uploaded ? (
                  <div className="flex items-center gap-1.5 flex-1 min-w-0 bg-white border border-emerald-300 rounded-lg px-2.5 py-1">
                    {uploaded.name.toLowerCase().endsWith('.pdf')
                      ? <FileText className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      : <ImageIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    }
                    <span className="text-[11px] text-emerald-700 truncate min-w-0 flex-1">{uploaded.name}</span>
                    <div className="ml-auto flex items-center gap-0.5 shrink-0">
                      <a href={viewUrl} target="_blank" rel="noreferrer" title="Visualizar"
                        className="p-1 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                        <Eye className="w-3.5 h-3.5" />
                      </a>
                      <a href={dlUrl} download={uploaded.name} title="Baixar"
                        className="p-1 rounded-md text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                        <Download className="w-3.5 h-3.5" />
                      </a>
                      <button type="button" onClick={() => handleRemove(i)} title="Remover"
                        className="p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      disabled={uploading === i}
                      onClick={() => fileRefs.current[i]?.click()}
                      className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                    >
                      {uploading === i
                        ? <><Loader2 className="w-3 h-3 animate-spin" />Enviando...</>
                        : <><Upload className="w-3 h-3" />Anexar arquivo</>
                      }
                    </button>
                    {/* Solicitar ao funcionário via WhatsApp — ao lado do Anexar (só no 1º slot) */}
                    {i === 0 && (
                      <button
                        type="button"
                        onClick={requestViaWhatsApp}
                        disabled={reqState === 'sending'}
                        title="Enviar ao funcionário um link por WhatsApp para anexar este documento"
                        className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-[#25D366] text-[#128C7E] hover:bg-[#25D366]/10 transition-colors disabled:opacity-60"
                      >
                        {reqState === 'sending'
                          ? <><Loader2 className="w-3 h-3 animate-spin" />Enviando...</>
                          : <><WppIcon className="w-3 h-3" />{requestedAt ? 'Reenviar solicitação' : 'Solicitar via WhatsApp'}</>}
                      </button>
                    )}
                  </>
                )}
                <input
                  ref={el => { fileRefs.current[i] = el }}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  className="hidden"
                  onChange={e => handleFileSelect(e, i)}
                />
              </div>
            )
          })}
          {reqError ? (
            <p className="text-[11px] text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{reqError}</p>
          ) : requestedAt && (
            <p className="text-[11px] text-emerald-600 flex items-center gap-1">
              <WppIcon className="w-3 h-3" />Última solicitação enviada em {formatDateTime(requestedAt)}
            </p>
          )}
          {uploadError && (
            <p className="text-[11px] text-red-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />{uploadError}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function FichaAdmissaoForm({ candidate, jobTitle, companyName: _companyName, initialData, companies, docRequestDates = {} }: Props) {
  const [form, setForm] = useState<AdmissionFormData>(() =>
    initialData ? migrateData(initialData, candidate, jobTitle) : makeEmpty(candidate, jobTitle)
  )
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [cpfError, setCpfError] = useState('')
  const [cepLoading, setCepLoading] = useState(false)

  function set<K extends keyof AdmissionFormData>(key: K, val: AdmissionFormData[K]) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  function setDoc(key: string, val: DocState) {
    setForm(prev => ({ ...prev, docs: { ...prev.docs, [key]: val } }))
  }

  function handleCpfChange(raw: string) {
    const masked = maskCPF(raw)
    set('cpf_value', masked)
    const digits = masked.replace(/\D/g, '')
    if (digits.length === 11) setCpfError(validateCPF(masked) ? '' : 'CPF inválido')
    else setCpfError('')
  }

  async function handleCepChange(raw: string) {
    const masked = raw.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2')
    set('address_cep', masked)
    const digits = masked.replace(/\D/g, '')
    if (digits.length === 8) {
      setCepLoading(true)
      try {
        const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
        const data = await res.json()
        if (!data.erro) {
          setForm(prev => ({
            ...prev,
            address_cep: masked,
            address_street: data.logradouro || prev.address_street,
            address_bairro: data.bairro || prev.address_bairro,
            address_city: data.localidade || prev.address_city,
          }))
        }
      } catch { /* ignora */ }
      finally { setCepLoading(false) }
    }
  }

  async function handleSave() {
    const digits = form.cpf_value.replace(/\D/g, '')
    if (digits.length > 0 && digits.length < 11) { setCpfError('CPF incompleto'); return }
    if (digits.length === 11 && !validateCPF(form.cpf_value)) { setCpfError('CPF inválido'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidate.id}/admission-form`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setToast({ type: 'ok', msg: 'Ficha salva com sucesso!' })
    } catch (e) {
      setToast({ type: 'err', msg: (e as Error).message || 'Erro ao salvar.' })
    } finally {
      setSaving(false)
      setTimeout(() => setToast(null), 4000)
    }
  }

  const childrenCount = parseInt(form.children_count) || 0

  // Docs visíveis: oculta docs de filhos se sem filhos; oculta pensão se alimony=false
  const visibleDocs = ALL_DOCS.filter(d => {
    if (d.perChild && childrenCount === 0) return false
    if (d.key === 'pensao_alimenticia' && form.alimony === false) return false
    return true
  })

  const totalDocs = visibleDocs.length
  const doneCount = visibleDocs.filter(d => {
    const s = form.docs[d.key]
    if (!s) return false
    if (s.not_applicable) return true
    const needed = d.perChild ? Math.max(1, childrenCount) : 1
    return (s.files?.filter(Boolean).length ?? 0) >= needed
  }).length

  return (
    <>
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      <div className="bg-white rounded-2xl border shadow-sm p-6 sm:p-8 space-y-0 max-w-3xl">
        <div className="flex items-center justify-between gap-3 mb-6">
          <h2 className="text-xl font-bold text-gray-900">Ficha Cadastral</h2>
          <Button onClick={handleSave} disabled={saving || !!cpfError} size="sm" className="gap-1.5 shrink-0">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Salvando...</> : <><Save className="w-4 h-4" />Salvar ficha</>}
          </Button>
        </div>

        {/* ── Empresa contratante ──────────────────────────────────────── */}
        {companies.length > 0 && (
          <div className="mb-4">
            <Field label="Empresa contratante">
              <select
                value={form.selected_company_id}
                onChange={e => set('selected_company_id', e.target.value)}
                className="h-10 w-full border border-gray-300 rounded-md px-3 text-sm bg-white"
              >
                <option value="">Selecionar empresa...</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.razao_social || c.apelido || 'Empresa'}{c.cnpj ? ` — ${c.cnpj}` : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}

        {/* ── Dados do Funcionário ────────────────────────────────────── */}
        <SectionTitle>Dados do Funcionário</SectionTitle>
        <div className="grid grid-cols-1 gap-3">
          <Field label="Nome Completo">
            <div className="h-9 flex items-center px-3 border border-gray-200 rounded-md bg-gray-50 text-sm font-medium">{candidate.full_name}</div>
          </Field>
          <Field label="E-mail">
            <div className="h-9 flex items-center px-3 border border-gray-200 rounded-md bg-gray-50 text-sm truncate">{candidate.email || '—'}</div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Telefone Celular">
              <div className="h-9 flex items-center px-3 border border-gray-200 rounded-md bg-gray-50 text-sm">{candidate.phone || '—'}</div>
            </Field>
            <Field label="Telefone Fixo">
              <Input value={form.phone_landline} onChange={e => set('phone_landline', e.target.value)} placeholder="(  )      -    " />
            </Field>
          </div>
          {/* CEP */}
          <div className="grid grid-cols-3 gap-3">
            <Field label={cepLoading ? 'CEP — buscando...' : 'CEP'}>
              <div className="relative">
                <Input value={form.address_cep} onChange={e => handleCepChange(e.target.value)} placeholder="00000-000" maxLength={9} />
                {cepLoading
                  ? <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-primary" />
                  : <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />}
              </div>
            </Field>
            <Field label="Bairro">
              <Input value={form.address_bairro} onChange={e => set('address_bairro', e.target.value)} placeholder="Bairro" />
            </Field>
            <Field label="Cidade">
              <Input value={form.address_city} onChange={e => set('address_city', e.target.value)} placeholder="Cidade" />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Endereço (logradouro)" className="col-span-2">
              <Input value={form.address_street} onChange={e => set('address_street', e.target.value)} placeholder="Rua, Av., Travessa..." />
            </Field>
            <Field label="Número">
              <Input value={form.address_number} onChange={e => set('address_number', e.target.value)} placeholder="Nº" />
            </Field>
          </div>
          <Field label="Complemento">
            <Input value={form.address_complement} onChange={e => set('address_complement', e.target.value)} placeholder="Apto, Bloco, Casa..." />
          </Field>

          {/* PIS */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nº PIS">
              <Input value={form.pis} onChange={e => set('pis', maskPIS(e.target.value))} placeholder="000.00000.00-0" />
            </Field>
            <Field label="Data de Cadastro do PIS">
              <Input type="date" value={form.pis_date} onChange={e => set('pis_date', e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nº da Identidade (RG)">
              <Input value={form.identity_number} onChange={e => set('identity_number', e.target.value)} placeholder="00.000.000-0" />
            </Field>
            <Field label="Data de Emissão (RG)">
              <Input type="date" value={form.identity_date} onChange={e => set('identity_date', e.target.value)} />
            </Field>
          </div>
          {/* CPF — abaixo do RG */}
          <Field label="CPF">
            <div className="space-y-1">
              <Input value={form.cpf_value} onChange={e => handleCpfChange(e.target.value)} placeholder="000.000.000-00"
                className={cpfError ? 'border-red-400 focus-visible:ring-red-300' : ''} />
              {cpfError && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{cpfError}</p>}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Estado Civil">
              <select value={form.marital_status} onChange={e => set('marital_status', e.target.value)}
                className="h-9 w-full border border-gray-300 rounded-md px-3 text-sm bg-white">
                <option value="">Selecionar...</option>
                {MARITAL.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Grau de Escolaridade">
              <select value={form.education} onChange={e => set('education', e.target.value)}
                className="h-9 w-full border border-gray-300 rounded-md px-3 text-sm bg-white">
                <option value="">Selecionar...</option>
                {EDUCATION.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <Field label="Mensalidade Sindical?"><YesNo value={form.union_dues} onChange={v => set('union_dues', v)} /></Field>
            <Field label="Vale Transporte?"><YesNo value={form.transport_benefit} onChange={v => set('transport_benefit', v)} /></Field>
          </div>
        </div>

        {/* ── Dados do Empregador ─────────────────────────────────────── */}
        <SectionTitle>Dados do Empregador</SectionTitle>
        <div className="grid grid-cols-1 gap-3">
          <Field label="Função / Cargo">
            <Input value={form.function_title} onChange={e => set('function_title', e.target.value)} placeholder="Ex: Auxiliar de produção" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Salário Base">
              <Input value={form.salary} onChange={e => set('salary', maskBRL(e.target.value))} inputMode="numeric" placeholder="R$ 0.000,00" />
            </Field>
            <Field label="Data de Admissão">
              <Input type="date" value={form.admission_date} onChange={e => set('admission_date', e.target.value)} />
            </Field>
          </div>
          <Field label="Contrato de Experiência">
            <select
              value={form.trial_contract}
              onChange={e => set('trial_contract', e.target.value)}
              className="h-9 w-full border border-gray-300 rounded-md px-3 text-sm bg-white"
            >
              <option value="">Selecionar...</option>
              <option value="15 + 15 dias">15 + 15 dias</option>
              <option value="30 + 30 dias">30 + 30 dias</option>
              <option value="45 + 45 dias">45 + 45 dias</option>
              <option value="30 + 60 dias">30 + 60 dias</option>
              <option value="Sem experiência">Sem experiência</option>
            </select>
          </Field>
        </div>

        {/* ── Salário Família ─────────────────────────────────────────── */}
        <SectionTitle>Salário Família / Dependentes</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Filhos menores de 14 anos">
            <Input type="number" min={0} value={form.children_count} onChange={e => set('children_count', e.target.value)} />
          </Field>
          <Field label="Pensão Alimentícia (decisão judicial)?">
            <YesNo value={form.alimony} onChange={v => set('alimony', v)} />
          </Field>
        </div>

        {/* ── Documentos ─────────────────────────────────────────────── */}
        <SectionTitle>Documentos Entregues</SectionTitle>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] text-muted-foreground">Esta lista não é incluída no PDF exportado.</p>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${doneCount === totalDocs ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            {doneCount}/{totalDocs} concluídos
          </span>
        </div>
        <div className="space-y-2">
          {visibleDocs.map(doc => (
            <DocRow
              key={doc.key}
              docDef={doc}
              state={form.docs[doc.key] || emptyDoc()}
              onChange={s => setDoc(doc.key, s)}
              candidateId={candidate.id}
              childrenCount={childrenCount}
              initialRequestedAt={docRequestDates[doc.key] || null}
            />
          ))}
        </div>

        {/* ── Vale Transporte ──────────────────────────────────────────── */}
        <SectionTitle>Vale Transporte</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Empresa de Transporte">
            <Input value={form.transport_company} onChange={e => set('transport_company', e.target.value)} placeholder="Nome da empresa" />
          </Field>
          <Field label="Quantidade de Passagens / dia">
            <Input value={form.transport_count} onChange={e => set('transport_count', e.target.value)} placeholder="Ex: 2" />
          </Field>
        </div>

        {/* ── Observações ──────────────────────────────────────────────── */}
        <SectionTitle>Observações</SectionTitle>
        <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
          placeholder="Informações adicionais..."
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />

        {/* ── Assinaturas ─────────────────────────────────────────────── */}
        <div className="mt-8 pt-4 border-t grid grid-cols-2 gap-8">
          <div className="text-center"><div className="h-10 border-b border-gray-400 mb-1" /><p className="text-[11px] text-gray-500">Assinatura do Funcionário</p></div>
          <div className="text-center"><div className="h-10 border-b border-gray-400 mb-1" /><p className="text-[11px] text-gray-500">Assinatura Empresa</p></div>
        </div>
      </div>

      {/* Salvar — final da página */}
      <div className="mt-4 max-w-3xl">
        <Button onClick={handleSave} disabled={saving || !!cpfError} className="gap-1.5 w-full sm:w-auto">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Salvando...</> : <><Save className="w-4 h-4" />Salvar ficha</>}
        </Button>
      </div>
    </>
  )
}
