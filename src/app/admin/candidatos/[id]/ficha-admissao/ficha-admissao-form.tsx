'use client'
import { useState } from 'react'
import { Loader2, Save, Printer, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface AdmissionFormData {
  // Funcionário
  pis: string
  pis_date: string
  identity_number: string
  identity_date: string
  phone_landline: string
  marital_status: string
  education: string
  union_dues: boolean | null
  transport_benefit: boolean | null
  // Empregador
  function_title: string
  salary: string
  admission_date: string
  trial_contract: string
  // Documentos entregues
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

interface Candidate {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  cpf: string | null
  city: string | null
  neighborhood: string | null
}

interface Props {
  candidate: Candidate
  jobTitle: string | null
  companyName: string | null
  initialData: AdmissionFormData | null
}

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

function makeEmpty(candidate: Candidate, jobTitle: string | null): AdmissionFormData {
  return {
    pis: '', pis_date: '',
    identity_number: '', identity_date: '',
    phone_landline: '',
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
          <input
            type="radio"
            checked={value === v}
            onChange={() => onChange(v)}
            className="accent-primary"
          />
          <span className="text-sm">{v ? 'Sim' : 'Não'}</span>
        </label>
      ))}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function FichaAdmissaoForm({ candidate, jobTitle, companyName, initialData }: Props) {
  const [form, setForm] = useState<AdmissionFormData>(
    initialData ?? makeEmpty(candidate, jobTitle)
  )
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  function set<K extends keyof AdmissionFormData>(key: K, val: AdmissionFormData[K]) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  function setDoc(key: string, val: boolean) {
    setForm(prev => ({ ...prev, docs: { ...prev.docs, [key]: val } }))
  }

  async function handleSave() {
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

  function handlePrint() {
    window.print()
  }

  const today = new Date().toLocaleDateString('pt-BR')

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium print:hidden ${toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Action buttons (screen only) */}
      <div className="flex gap-2 mb-5 print:hidden">
        <Button onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Salvando...</> : <><Save className="w-4 h-4" />Salvar ficha</>}
        </Button>
        <Button variant="outline" onClick={handlePrint} className="gap-1.5">
          <Printer className="w-4 h-4" />
          Exportar / Imprimir
        </Button>
      </div>

      {/* ── Documento imprimível ── */}
      <div className="bg-white rounded-2xl border shadow-sm p-6 sm:p-8 space-y-0 print:shadow-none print:border-none print:p-0 print:rounded-none max-w-3xl">

        {/* Cabeçalho da ficha */}
        <div className="text-center mb-4 space-y-1">
          <p className="text-[11px] uppercase tracking-widest text-gray-400 font-semibold print:text-black">
            {companyName || 'Brownie do Ton'}
          </p>
          <h1 className="text-lg font-bold tracking-wide text-gray-900">FICHA CADASTRAL PARA ADMISSÃO DE FUNCIONÁRIOS</h1>
          <p className="text-[12px] text-gray-500 print:text-black">
            Data do Preenchimento: {today}
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-[11px] text-amber-800 text-center mb-4 print:hidden">
          ⚠️ Contratar empresa de Saúde do Trabalhador c/ Registro Ministério do Trabalho para execução dos ASOs, exames periódicos, PPRA, PCMSO, LTCR etc. e envio ao eSocial.
        </div>

        {/* ─── DADOS DO CANDIDATO (pré-preenchidos, somente leitura) ─────── */}
        <SectionTitle>Dados do Funcionário</SectionTitle>

        <div className="grid grid-cols-1 gap-3">
          <Field label="Nome Completo">
            <div className="h-9 flex items-center px-3 border border-gray-200 rounded-md bg-gray-50 text-sm font-medium text-gray-900">
              {candidate.full_name}
            </div>
          </Field>

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

          <div className="grid grid-cols-3 gap-3">
            <Field label="Cidade" className="col-span-2">
              <div className="h-9 flex items-center px-3 border border-gray-200 rounded-md bg-gray-50 text-sm text-gray-700">
                {candidate.city || '—'}
              </div>
            </Field>
            <Field label="Bairro">
              <div className="h-9 flex items-center px-3 border border-gray-200 rounded-md bg-gray-50 text-sm text-gray-700">
                {candidate.neighborhood || '—'}
              </div>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="CPF">
              <div className="h-9 flex items-center px-3 border border-gray-200 rounded-md bg-gray-50 text-sm text-gray-700">
                {candidate.cpf || '—'}
              </div>
            </Field>
            <Field label="E-mail">
              <div className="h-9 flex items-center px-3 border border-gray-200 rounded-md bg-gray-50 text-sm text-gray-700 truncate">
                {candidate.email || '—'}
              </div>
            </Field>
          </div>

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
            <Field label="Data de Emissão">
              <Input type="date" value={form.identity_date} onChange={e => set('identity_date', e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Estado Civil">
              <select
                value={form.marital_status}
                onChange={e => set('marital_status', e.target.value)}
                className="h-9 w-full border border-gray-300 rounded-md px-3 text-sm bg-white"
              >
                <option value="">Selecionar...</option>
                {MARITAL.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Grau de Escolaridade">
              <select
                value={form.education}
                onChange={e => set('education', e.target.value)}
                className="h-9 w-full border border-gray-300 rounded-md px-3 text-sm bg-white"
              >
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

        {/* ─── DOCUMENTOS ───────────────────────────────────────────────── */}
        <SectionTitle>Documentos Entregues</SectionTitle>

        <div className="space-y-2">
          {DOCS.map(doc => (
            <label key={doc.key} className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={!!form.docs[doc.key]}
                onChange={e => setDoc(doc.key, e.target.checked)}
                className="w-4 h-4 rounded accent-primary shrink-0"
              />
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
            <Input
              type="number"
              min={0}
              value={form.children_count}
              onChange={e => set('children_count', e.target.value)}
            />
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
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          rows={3}
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

        {/* Rodapé */}
        <p className="text-[10px] text-gray-400 text-center mt-4 print:block hidden">
          Tel. Médico do Trabalho: (24) 2242-0310 – Paulo Bittencourt | Dr. Moreirão: (24) 2243-8608
        </p>
      </div>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          .ficha-print, .ficha-print * { visibility: visible; }
          .ficha-print { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </>
  )
}
