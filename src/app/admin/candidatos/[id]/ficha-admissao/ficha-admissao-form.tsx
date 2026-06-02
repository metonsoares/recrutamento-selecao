'use client'
import { useState } from 'react'
import { Loader2, Save, CheckCircle2, AlertCircle, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface AdmissionFormData {
  // CPF (editável com validação)
  cpf_value: string
  // Endereço
  address_street: string
  address_number: string
  address_complement: string
  address_bairro: string
  address_city: string
  address_cep: string
  // Contato
  phone_landline: string
  // Documentário
  pis: string
  pis_date: string
  identity_number: string
  identity_date: string
  marital_status: string
  education: string
  union_dues: boolean | null
  transport_benefit: boolean | null
  // Empregador
  function_title: string
  salary: string
  admission_date: string
  trial_contract: string
  // Documentos entregues (web only — não vai para PDF)
  docs: Record<string, boolean>
  // Salário família
  children_count: string
  alimony: boolean | null
  // Vale Transporte
  transport_company: string
  transport_count: string
  // Observações
  notes: string
}

export interface CandidateAddress {
  street: string
  number: string
  complement: string
  neighborhood: string
  city: string
  cep: string
}

interface Candidate {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  cpf: string | null
  city: string | null
  neighborhood: string | null
  address: CandidateAddress | null
}

interface Props {
  candidate: Candidate
  jobTitle: string | null
  companyName: string | null
  initialData: AdmissionFormData | null
}

// ─── Documentos ───────────────────────────────────────────────────────────────

const DOCS = [
  { key: 'carteira_profissional', label: 'Carteira Profissional (folhas de identificação e qualificação)' },
  { key: 'carteira_digital', label: 'Carteira de Trabalho Digital' },
  { key: 'foto_3x4', label: '01 Foto 3 × 4' },
  { key: 'atestado_admissional', label: 'Atestado Admissional (Médico do Trabalho)' },
  { key: 'cartao_pis', label: 'Cartão de Inscrição no PIS' },
  { key: 'cpf', label: 'CPF' },
  { key: 'identidade', label: 'Carteira de Identidade (RG)' },
  { key: 'titulo_eleitor', label: 'Título de Eleitor' },
  { key: 'certificado_reservista', label: 'Certificado de Reservista (masc.)' },
  { key: 'comprovante_escolaridade', label: 'Comprovante de Escolaridade' },
  { key: 'certidao_civil', label: 'Certidão de Nascimento / Casamento / outros' },
  { key: 'comprovante_residencia', label: 'Comprovante de Residência' },
  { key: 'certidao_nascimento_filhos', label: 'Certidão de Nascimento dos filhos' },
  { key: 'cpf_dependentes', label: 'CPF dos dependentes' },
  { key: 'carteira_vacinacao', label: 'Carteira de Vacinação (filhos)' },
  { key: 'declaracao_escolar', label: 'Declaração Escolar dos filhos' },
  { key: 'pensao_alimenticia', label: 'Decisão Judicial – Pensão Alimentícia' },
]

const MARITAL = ['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União Estável', 'Separado(a)']
const EDUCATION = ['Fundamental Incompleto', 'Fundamental Completo', 'Médio Incompleto', 'Médio Completo', 'Superior Incompleto', 'Superior Completo', 'Pós-graduação']

// ─── CPF ──────────────────────────────────────────────────────────────────────

function maskCPF(v: string): string {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

function validateCPF(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false
  const calc = (n: number) => {
    let sum = 0
    for (let i = 0; i < n; i++) sum += parseInt(d[i]) * (n + 1 - i)
    const rem = (sum * 10) % 11
    return rem >= 10 ? 0 : rem
  }
  return calc(9) === parseInt(d[9]) && calc(10) === parseInt(d[10])
}

// ─── makeEmpty ────────────────────────────────────────────────────────────────

function makeEmpty(candidate: Candidate, jobTitle: string | null): AdmissionFormData {
  const addr = candidate.address
  const rawCpf = candidate.cpf?.replace(/\D/g, '') ?? ''
  const maskedCpf = rawCpf ? maskCPF(rawCpf) : ''
  return {
    cpf_value: maskedCpf,
    address_street: addr?.street || '',
    address_number: addr?.number || '',
    address_complement: addr?.complement || '',
    address_bairro: addr?.neighborhood || candidate.neighborhood || '',
    address_city: addr?.city || candidate.city || '',
    address_cep: addr?.cep || '',
    phone_landline: '',
    pis: '', pis_date: '',
    identity_number: '', identity_date: '',
    marital_status: '', education: '',
    union_dues: null, transport_benefit: null,
    function_title: jobTitle || '',
    salary: '', admission_date: '', trial_contract: '45 + 45 dias',
    docs: Object.fromEntries(DOCS.map(d => [d.key, false])),
    children_count: '0', alimony: null,
    transport_company: '', transport_count: '',
    notes: '',
  }
}

// ─── Field helpers ────────────────────────────────────────────────────────────

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

// ─── Componente principal ─────────────────────────────────────────────────────

export function FichaAdmissaoForm({ candidate, jobTitle, companyName: _companyName, initialData }: Props) {
  const [form, setForm] = useState<AdmissionFormData>(() => {
    if (initialData) {
      // garante cpf_value preenchido se não estava no dado salvo
      return {
        ...makeEmpty(candidate, jobTitle),
        ...initialData,
        cpf_value: initialData.cpf_value || makeEmpty(candidate, jobTitle).cpf_value,
      }
    }
    return makeEmpty(candidate, jobTitle)
  })

  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [cpfError, setCpfError] = useState('')
  const [cepLoading, setCepLoading] = useState(false)

  function set<K extends keyof AdmissionFormData>(key: K, val: AdmissionFormData[K]) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  function setDoc(key: string, val: boolean) {
    setForm(prev => ({ ...prev, docs: { ...prev.docs, [key]: val } }))
  }

  // ── CPF ──────────────────────────────────────────────────────────────────
  function handleCpfChange(raw: string) {
    const masked = maskCPF(raw)
    set('cpf_value', masked)
    const digits = masked.replace(/\D/g, '')
    if (digits.length === 11) {
      setCpfError(validateCPF(masked) ? '' : 'CPF inválido')
    } else {
      setCpfError('')
    }
  }

  // ── CEP lookup (ViaCEP) ───────────────────────────────────────────────────
  async function handleCepChange(raw: string) {
    const masked = raw.replace(/\D/g, '').slice(0, 8)
      .replace(/(\d{5})(\d)/, '$1-$2')
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
      } catch { /* ignora erro de rede */ }
      finally { setCepLoading(false) }
    }
  }

  // ── Salvar ────────────────────────────────────────────────────────────────
  async function handleSave() {
    const digits = form.cpf_value.replace(/\D/g, '')
    if (digits.length > 0 && digits.length < 11) {
      setCpfError('CPF incompleto')
      return
    }
    if (digits.length === 11 && !validateCPF(form.cpf_value)) {
      setCpfError('CPF inválido')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidate.id}/admission-form`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
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

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      <div className="bg-white rounded-2xl border shadow-sm p-6 sm:p-8 space-y-0 max-w-3xl">

        <h2 className="text-xl font-bold text-center text-gray-900 mb-6">Ficha Cadastral</h2>

        {/* ─── DADOS DO FUNCIONÁRIO ─────────────────────────────────────── */}
        <SectionTitle>Dados do Funcionário</SectionTitle>

        <div className="grid grid-cols-1 gap-3">
          {/* Nome — leitura */}
          <Field label="Nome Completo">
            <div className="h-9 flex items-center px-3 border border-gray-200 rounded-md bg-gray-50 text-sm font-medium text-gray-900">
              {candidate.full_name}
            </div>
          </Field>

          {/* CPF — editável com validação */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="CPF">
              <div className="space-y-1">
                <Input
                  value={form.cpf_value}
                  onChange={e => handleCpfChange(e.target.value)}
                  placeholder="000.000.000-00"
                  className={cpfError ? 'border-red-400 focus-visible:ring-red-300' : ''}
                />
                {cpfError && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />{cpfError}
                  </p>
                )}
              </div>
            </Field>
            <Field label="E-mail">
              <div className="h-9 flex items-center px-3 border border-gray-200 rounded-md bg-gray-50 text-sm text-gray-700 truncate">
                {candidate.email || '—'}
              </div>
            </Field>
          </div>

          {/* Telefones */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Telefone Celular">
              <div className="h-9 flex items-center px-3 border border-gray-200 rounded-md bg-gray-50 text-sm text-gray-700">
                {candidate.phone || '—'}
              </div>
            </Field>
            <Field label="Telefone Fixo">
              <Input value={form.phone_landline} onChange={e => set('phone_landline', e.target.value)} placeholder="(  )      -    " />
            </Field>
          </div>

          {/* CEP + busca automática */}
          <div className="grid grid-cols-3 gap-3">
            <Field label={cepLoading ? 'CEP — buscando...' : 'CEP'}>
              <div className="relative">
                <Input
                  value={form.address_cep}
                  onChange={e => handleCepChange(e.target.value)}
                  placeholder="00000-000"
                  maxLength={9}
                />
                {cepLoading && (
                  <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-primary" />
                )}
                {!cepLoading && (
                  <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
                )}
              </div>
            </Field>
            <Field label="Bairro">
              <Input value={form.address_bairro} onChange={e => set('address_bairro', e.target.value)} placeholder="Bairro" />
            </Field>
            <Field label="Cidade">
              <Input value={form.address_city} onChange={e => set('address_city', e.target.value)} placeholder="Cidade" />
            </Field>
          </div>

          {/* Endereço */}
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

          {/* PIS / RG */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nº PIS">
              <Input value={form.pis} onChange={e => set('pis', e.target.value)} placeholder="000.00000.00-0" />
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
            <Field label="Mensalidade Sindical?">
              <YesNo value={form.union_dues} onChange={v => set('union_dues', v)} />
            </Field>
            <Field label="Vale Transporte?">
              <YesNo value={form.transport_benefit} onChange={v => set('transport_benefit', v)} />
            </Field>
          </div>
        </div>

        {/* ─── DADOS DO EMPREGADOR ──────────────────────────────────────── */}
        <SectionTitle>Dados do Empregador</SectionTitle>
        <div className="grid grid-cols-1 gap-3">
          <Field label="Função / Cargo">
            <Input value={form.function_title} onChange={e => set('function_title', e.target.value)} placeholder="Ex: Auxiliar de produção" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Salário Base">
              <Input value={form.salary} onChange={e => set('salary', e.target.value)} placeholder="R$ 0.000,00" />
            </Field>
            <Field label="Data de Admissão">
              <Input type="date" value={form.admission_date} onChange={e => set('admission_date', e.target.value)} />
            </Field>
          </div>
          <Field label="Contrato de Experiência">
            <Input value={form.trial_contract} onChange={e => set('trial_contract', e.target.value)} placeholder="Ex: 45 + 45 dias" />
          </Field>
        </div>

        {/* ─── DOCUMENTOS (somente web — não vai para PDF) ──────────────── */}
        <SectionTitle>Documentos Entregues</SectionTitle>
        <p className="text-[11px] text-muted-foreground mb-2">Esta lista não é incluída no PDF exportado.</p>
        <div className="space-y-2">
          {DOCS.map(doc => (
            <label key={doc.key} className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={!!form.docs[doc.key]} onChange={e => setDoc(doc.key, e.target.checked)}
                className="w-4 h-4 rounded accent-primary shrink-0" />
              <span className={`text-sm transition-colors ${form.docs[doc.key] ? 'text-gray-900 line-through decoration-emerald-500' : 'text-gray-600'}`}>
                {doc.label}
              </span>
            </label>
          ))}
        </div>

        {/* ─── SALÁRIO FAMÍLIA ──────────────────────────────────────────── */}
        <SectionTitle>Salário Família / Dependentes</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Filhos menores de 14 anos">
            <Input type="number" min={0} value={form.children_count} onChange={e => set('children_count', e.target.value)} />
          </Field>
          <Field label="Pensão Alimentícia (decisão judicial)?">
            <YesNo value={form.alimony} onChange={v => set('alimony', v)} />
          </Field>
        </div>

        {/* ─── VALE TRANSPORTE ─────────────────────────────────────────── */}
        <SectionTitle>Vale Transporte</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Empresa de Transporte">
            <Input value={form.transport_company} onChange={e => set('transport_company', e.target.value)} placeholder="Nome da empresa" />
          </Field>
          <Field label="Quantidade de Passagens / dia">
            <Input value={form.transport_count} onChange={e => set('transport_count', e.target.value)} placeholder="Ex: 2" />
          </Field>
        </div>

        {/* ─── OBSERVAÇÕES ─────────────────────────────────────────────── */}
        <SectionTitle>Observações</SectionTitle>
        <textarea
          value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
          placeholder="Informações adicionais sobre o funcionário ou admissão..."
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
        />

        {/* ─── Assinaturas ─────────────────────────────────────────────── */}
        <div className="mt-8 pt-4 border-t grid grid-cols-2 gap-8">
          <div className="text-center space-y-1">
            <div className="h-10 border-b border-gray-400" />
            <p className="text-[11px] text-gray-500">Assinatura do Funcionário</p>
          </div>
          <div className="text-center space-y-1">
            <div className="h-10 border-b border-gray-400" />
            <p className="text-[11px] text-gray-500">Assinatura do Responsável</p>
          </div>
        </div>
      </div>

      {/* ─── Botão Salvar — ao final da página ───────────────────────────── */}
      <div className="mt-4 max-w-3xl">
        <Button onClick={handleSave} disabled={saving || !!cpfError} className="gap-1.5 w-full sm:w-auto">
          {saving
            ? <><Loader2 className="w-4 h-4 animate-spin" />Salvando...</>
            : <><Save className="w-4 h-4" />Salvar ficha</>}
        </Button>
      </div>
    </>
  )
}
