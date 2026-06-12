'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Loader2, Save, CheckCircle2, AlertCircle, Plus, Trash2,
  FileSignature, X, UserCheck, UserMinus, TrendingUp, TrendingDown,
  Upload, FileText, Calculator, CalendarX,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/helpers'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface UploadedFile { url: string; name: string; path: string }
interface Adjustment {
  id: string
  type: 'adiantamento' | 'desconto'
  description: string
  value: string  // formato R$
  receipt?: UploadedFile | null
}
interface Absence { id: string; date: string; compensada: boolean }

export interface ContractData {
  company_id: string
  company_name: string
  start_date: string
  days: string
  end_date: string
  funcao: string
  valor: string
  bonus: string
  adjustments: Adjustment[]
  absences: Absence[]
  faltas?: number
}

export interface CompanyOption { id: string; apelido: string | null; razao_social: string | null; cnpj: string | null }

interface CandidateAddress {
  street: string; number: string; complement: string
  neighborhood: string; city: string; cep: string
}

interface Props {
  candidateId: string
  fullName: string
  cpf: string | null
  address: CandidateAddress | null
  jobTitle: string | null
  initialData: ContractData | null
  companies: CompanyOption[]
}

// ─── Moeda ────────────────────────────────────────────────────────────────────

function maskBRL(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  const num = Number(digits) / 100
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function parseBRL(str: string | undefined): number {
  if (!str) return 0
  return Number(str.replace(/\D/g, '')) / 100
}
function fmtBRL(num: number): string {
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function field(label: string, children: React.ReactNode, className = '') {
  return (
    <div className={`space-y-1 ${className}`} key={label}>
      <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</label>
      {children}
    </div>
  )
}

function addDays(iso: string, days: number): string {
  if (!iso || !days) return ''
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
function genId() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now() + Math.random())
}
function makeEmpty(jobTitle: string | null): ContractData {
  return { company_id: '', company_name: '', start_date: '', days: '', end_date: '', funcao: jobTitle || '', valor: '', bonus: '', adjustments: [], absences: [] }
}

// ─── Linha de adiantamento/desconto ───────────────────────────────────────────

function AdjustmentRow({ candidateId, item, onChange, onRemove, onSave }: {
  candidateId: string
  item: Adjustment
  onChange: (i: Adjustment) => void
  onRemove: () => void
  onSave: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const isAdiant = item.type === 'adiantamento'

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 4 * 1024 * 1024) return
    setUploading(true)
    const fd = new FormData(); fd.append('file', f); fd.append('docKey', 'recibo')
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/admission-docs`, { method: 'POST', body: fd })
      const d = await res.json()
      if (res.ok) onChange({ ...item, receipt: { url: d.url, name: f.name, path: d.path } })
    } finally { setUploading(false); if (e.target) e.target.value = '' }
  }

  return (
    <div className={`rounded-lg border p-2 ${isAdiant ? 'bg-blue-50/50 border-blue-200' : 'bg-rose-50/50 border-rose-200'}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isAdiant ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'}`}>
          {isAdiant ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
          {isAdiant ? 'Adiant.' : 'Desconto'}
        </span>
        <Input value={item.description} onChange={e => onChange({ ...item, description: e.target.value })} placeholder="Descrição" className="h-8 text-sm flex-1 min-w-[120px]" />
        <Input value={item.value} onChange={e => onChange({ ...item, value: maskBRL(e.target.value) })} placeholder="R$ 0,00" className="h-8 text-sm w-28" />
        <Button type="button" size="sm" onClick={onSave} className="h-8 gap-1 px-2.5"><Save className="w-3.5 h-3.5" /></Button>
        <button onClick={onRemove} className="text-gray-400 hover:text-red-500 shrink-0"><Trash2 className="w-4 h-4" /></button>
      </div>
      {isAdiant && (
        <div className="mt-1.5 pl-1">
          {item.receipt ? (
            <div className="inline-flex items-center gap-1.5 bg-white border border-emerald-300 rounded-lg px-2 py-0.5">
              <FileText className="w-3.5 h-3.5 text-red-500" />
              <a href={item.receipt.url} target="_blank" rel="noreferrer" className="text-[11px] text-emerald-700 hover:underline truncate max-w-[160px]">{item.receipt.name}</a>
              <button onClick={() => onChange({ ...item, receipt: null })} className="text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
            </div>
          ) : (
            <button disabled={uploading} onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-primary hover:text-primary transition-colors disabled:opacity-50">
              {uploading ? <><Loader2 className="w-3 h-3 animate-spin" />Enviando...</> : <><Upload className="w-3 h-3" />Recibo</>}
            </button>
          )}
          <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={handleFile} />
        </div>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function DadosContratoTab({ candidateId, fullName, cpf, address, jobTitle, initialData, companies }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<ContractData>(() => {
    const base = makeEmpty(jobTitle)
    return initialData ? { ...base, ...initialData, adjustments: initialData.adjustments || [], absences: initialData.absences || [] } : base
  })
  const [saving, setSaving] = useState(false)
  const [encerrarOpen, setEncerrarOpen] = useState(false)
  const [contratarOpen, setContratarOpen] = useState(false)
  const [novaFalta, setNovaFalta] = useState('')
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  function set<K extends keyof ContractData>(k: K, v: ContractData[K]) { setForm(prev => ({ ...prev, [k]: v })) }
  function setStart(v: string) { setForm(prev => ({ ...prev, start_date: v, end_date: prev.days ? addDays(v, parseInt(prev.days) || 0) : prev.end_date })) }
  function setDays(v: string) { setForm(prev => ({ ...prev, days: v, end_date: prev.start_date ? addDays(prev.start_date, parseInt(v) || 0) : prev.end_date })) }

  function addAdjustment(type: 'adiantamento' | 'desconto') {
    setForm(prev => ({ ...prev, adjustments: [...prev.adjustments, { id: genId(), type, description: '', value: '', receipt: null }] }))
  }
  function updateAdjustment(id: string, next: Adjustment) {
    setForm(prev => ({ ...prev, adjustments: prev.adjustments.map(a => a.id === id ? next : a) }))
  }
  function removeAdjustment(id: string) {
    setForm(prev => ({ ...prev, adjustments: prev.adjustments.filter(a => a.id !== id) }))
  }
  function addFalta() {
    if (!novaFalta) return
    setForm(prev => ({ ...prev, absences: [...prev.absences, { id: genId(), date: novaFalta, compensada: false }] }))
    setNovaFalta('')
  }
  function toggleCompensada(id: string) {
    setForm(prev => ({ ...prev, absences: prev.absences.map(a => a.id === id ? { ...a, compensada: !a.compensada } : a) }))
  }
  function removeFalta(id: string) {
    setForm(prev => ({ ...prev, absences: prev.absences.filter(a => a.id !== id) }))
  }

  function showToast(type: 'ok' | 'err', msg: string) { setToast({ type, msg }); setTimeout(() => setToast(null), 4000) }

  async function save(status?: 'contratado' | 'desligado', extra?: Partial<ContractData>) {
    setSaving(true)
    try {
      const payload = { ...form, ...extra }
      const res = await fetch(`/api/admin/candidatos/${candidateId}/contract-data`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: payload, status }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      if (status) { router.refresh(); return true }
      showToast('ok', 'Dados do contrato salvos.')
      return true
    } catch (e) {
      showToast('err', (e as Error).message || 'Erro ao salvar.')
      return false
    } finally { setSaving(false) }
  }

  const enderecoCompleto = address
    ? [address.street, address.number, address.complement, address.neighborhood, address.city].filter(Boolean).join(', ')
    : '—'

  // ── Cálculo a pagar ──────────────────────────────────────────────────────
  const valorTotal = parseBRL(form.valor)
  const periodo = parseInt(form.days) || 0
  const valorDia = periodo > 0 ? valorTotal / periodo : 0
  const faltasNaoComp = form.absences.filter(a => !a.compensada).length
  const diasTrabalhados = Math.max(0, periodo - faltasNaoComp)
  const valorBruto = valorDia * diasTrabalhados
  const totalAdiant = form.adjustments.filter(a => a.type === 'adiantamento').reduce((s, a) => s + parseBRL(a.value), 0)
  const totalDesc = form.adjustments.filter(a => a.type === 'desconto').reduce((s, a) => s + parseBRL(a.value), 0)
  const descontoFaltas = valorDia * faltasNaoComp
  const bonusValor = parseBRL(form.bonus)
  const bonusAplicado = faltasNaoComp === 0 ? bonusValor : 0
  const aPagar = valorBruto - totalAdiant - totalDesc + bonusAplicado

  return (
    <>
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      <div className="bg-white rounded-2xl border shadow-sm p-6 sm:p-8 space-y-0 max-w-3xl">
        <div className="flex items-center justify-between gap-2 mb-5">
          <div className="flex items-center gap-2">
            <FileSignature className="w-5 h-5 text-teal-600" />
            <h2 className="text-xl font-bold text-gray-900">Dados para contrato</h2>
          </div>
          <Button onClick={() => save()} disabled={saving} className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shrink-0">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Salvando...</> : <><Save className="w-4 h-4" />Salvar</>}
          </Button>
        </div>

        {/* Empresa contratante */}
        <div className="mb-3">
          {field('Empresa contratante *',
            <select
              value={form.company_id}
              onChange={e => {
                const c = companies.find(x => x.id === e.target.value)
                setForm(prev => ({ ...prev, company_id: e.target.value, company_name: c ? (c.razao_social || c.apelido || '') : '' }))
              }}
              className="h-10 w-full border border-gray-300 rounded-md px-3 text-sm bg-white"
            >
              <option value="">Selecionar empresa...</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.razao_social || c.apelido || 'Empresa'}{c.cnpj ? ` — ${c.cnpj}` : ''}</option>
              ))}
            </select>)}
        </div>

        {/* Dados do candidato */}
        <div className="grid grid-cols-1 gap-3">
          {field('Nome completo', <div className="h-9 flex items-center px-3 border border-gray-200 rounded-md bg-gray-50 text-sm font-medium">{fullName}</div>)}
          <div className="grid grid-cols-2 gap-3">
            {field('CPF', <div className="h-9 flex items-center px-3 border border-gray-200 rounded-md bg-gray-50 text-sm text-gray-700">{cpf || '—'}</div>)}
            {field('CEP', <div className="h-9 flex items-center px-3 border border-gray-200 rounded-md bg-gray-50 text-sm text-gray-700">{address?.cep || '—'}</div>)}
          </div>
          {field('Endereço completo', <div className="min-h-9 flex items-center px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-sm text-gray-700">{enderecoCompleto}</div>)}
        </div>

        {/* Contrato */}
        <div className="flex items-center gap-2 mt-6 mb-3">
          <div className="flex-1 h-px bg-gray-200" /><span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Contrato</span><div className="flex-1 h-px bg-gray-200" />
        </div>
        <div className="grid grid-cols-1 gap-3">
          <div className="grid grid-cols-3 gap-3">
            {field('Data de início', <Input type="date" value={form.start_date} onChange={e => setStart(e.target.value)} />)}
            {field('Período (dias)', <Input type="number" min={1} value={form.days} onChange={e => setDays(e.target.value)} placeholder="Ex: 30" />)}
            {field('Data de término', <Input type="date" value={form.end_date} readOnly className="bg-gray-50 text-gray-600" />)}
          </div>
          {field('Função a exercer no contrato', <Input value={form.funcao} onChange={e => set('funcao', e.target.value)} placeholder="Ex: Garçom para evento" />)}
          {field('Valor de contrato (total)', <Input value={form.valor} onChange={e => set('valor', maskBRL(e.target.value))} placeholder="R$ 0,00" />)}
          {field('Valor bônus (opcional)',
            <div className="space-y-1">
              <Input value={form.bonus} onChange={e => set('bonus', maskBRL(e.target.value))} placeholder="R$ 0,00" />
              <p className="text-[11px] text-muted-foreground">Somado ao valor final apenas se o funcionário não tiver nenhuma falta.</p>
            </div>)}
        </div>

        {/* Adiantamentos e descontos */}
        <div className="flex items-center gap-2 mt-6 mb-3">
          <div className="flex-1 h-px bg-gray-200" /><span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Adiantamentos e descontos</span><div className="flex-1 h-px bg-gray-200" />
        </div>
        <div className="space-y-2">
          {form.adjustments.length === 0 && <p className="text-sm text-muted-foreground text-center py-2">Nenhum lançamento.</p>}
          {form.adjustments.map(a => (
            <AdjustmentRow key={a.id} candidateId={candidateId} item={a}
              onChange={next => updateAdjustment(a.id, next)}
              onRemove={() => removeAdjustment(a.id)}
              onSave={() => save()} />
          ))}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => addAdjustment('adiantamento')} className="gap-1.5 text-blue-700 border-blue-300 hover:bg-blue-50"><Plus className="w-3.5 h-3.5" />Adiantamento</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => addAdjustment('desconto')} className="gap-1.5 text-rose-700 border-rose-300 hover:bg-rose-50"><Plus className="w-3.5 h-3.5" />Desconto</Button>
          </div>
        </div>

        {/* Faltas */}
        <div className="flex items-center gap-2 mt-6 mb-3">
          <div className="flex-1 h-px bg-gray-200" /><span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Faltas</span><div className="flex-1 h-px bg-gray-200" />
        </div>
        <div className="space-y-2">
          {form.absences.map(a => (
            <div key={a.id} className={`flex items-center gap-2 rounded-lg border p-2 ${a.compensada ? 'bg-emerald-50/50 border-emerald-200' : 'bg-amber-50/50 border-amber-200'}`}>
              <CalendarX className={`w-4 h-4 shrink-0 ${a.compensada ? 'text-emerald-500' : 'text-amber-500'}`} />
              <span className="text-sm text-gray-700 flex-1">{formatDate(a.date)}</span>
              <label className="flex items-center gap-1.5 text-[12px] text-gray-600 cursor-pointer">
                <input type="checkbox" checked={a.compensada} onChange={() => toggleCompensada(a.id)} className="accent-emerald-600" />
                Compensada (não descontar)
              </label>
              <button onClick={() => removeFalta(a.id)} className="text-gray-400 hover:text-red-500 shrink-0"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Data da falta</label>
              <Input type="date" value={novaFalta} onChange={e => setNovaFalta(e.target.value)} className="w-44" />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addFalta} disabled={!novaFalta} className="gap-1.5"><Plus className="w-3.5 h-3.5" />Adicionar falta</Button>
          </div>
        </div>

        {/* Quadro de cálculo */}
        <div className="flex items-center gap-2 mt-6 mb-3">
          <div className="flex-1 h-px bg-gray-200" /><span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Cálculo a pagar</span><div className="flex-1 h-px bg-gray-200" />
        </div>
        <div className="rounded-xl border bg-gray-50 p-4 space-y-1.5 text-sm">
          <CalcRow label={`Valor do contrato (${periodo} dia${periodo !== 1 ? 's' : ''})`} value={fmtBRL(valorTotal)} />
          <CalcRow label="Valor por dia" value={fmtBRL(valorDia)} muted />
          <CalcRow label={`Dias trabalhados (${periodo} − ${faltasNaoComp} falta${faltasNaoComp !== 1 ? 's' : ''})`} value={`${diasTrabalhados} dia${diasTrabalhados !== 1 ? 's' : ''}`} muted />
          <CalcRow label="Valor proporcional aos dias trabalhados" value={fmtBRL(valorBruto)} />
          {faltasNaoComp > 0 && <CalcRow label={`(−) Faltas não compensadas (${faltasNaoComp})`} value={`− ${fmtBRL(descontoFaltas)}`} negative />}
          {totalAdiant > 0 && <CalcRow label="(−) Adiantamentos" value={`− ${fmtBRL(totalAdiant)}`} negative />}
          {totalDesc > 0 && <CalcRow label="(−) Descontos / quebras" value={`− ${fmtBRL(totalDesc)}`} negative />}
          {bonusValor > 0 && (
            bonusAplicado > 0
              ? <CalcRow label="(+) Bônus (sem faltas)" value={`+ ${fmtBRL(bonusAplicado)}`} positive />
              : <CalcRow label="(×) Bônus não aplicado (há faltas)" value={fmtBRL(bonusValor)} muted />
          )}
          <div className="border-t pt-2 mt-1 flex items-center justify-between">
            <span className="font-bold text-gray-900 flex items-center gap-1.5"><Calculator className="w-4 h-4" />Valor a pagar</span>
            <span className={`font-bold text-lg ${aPagar < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{fmtBRL(aPagar)}</span>
          </div>
        </div>
      </div>

      {/* Ações — todas na mesma linha */}
      <div className="mt-4 max-w-3xl flex flex-wrap gap-2">
        <Button variant="outline" disabled={saving} className="gap-1.5"
          onClick={async () => { const ok = await save(); if (ok) window.open(`/admin/candidatos/${candidateId}/print-contrato`, '_blank') }}>
          <FileText className="w-4 h-4" />Gerar contrato
        </Button>
        <Button variant="outline" disabled={saving} className="gap-1.5"
          onClick={async () => { const ok = await save(); if (ok) window.open(`/admin/candidatos/${candidateId}/print-recibo`, '_blank') }}>
          <FileSignature className="w-4 h-4" />Emitir recibo
        </Button>
        <Button onClick={() => setContratarOpen(true)} disabled={saving} className="gap-1.5"><UserCheck className="w-4 h-4" />Contratar</Button>
        <Button onClick={() => setEncerrarOpen(true)} disabled={saving} variant="outline" className="gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-50"><UserMinus className="w-4 h-4" />Encerrar contrato</Button>
      </div>

      {/* Salvar — também no rodapé, em destaque */}
      <div className="mt-4 max-w-3xl">
        <Button onClick={() => save()} disabled={saving} className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Salvando...</> : <><Save className="w-4 h-4" />Salvar</>}
        </Button>
      </div>

      {/* Modal Contratar */}
      {contratarOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-2"><UserCheck className="w-5 h-5 text-emerald-600" /><h2 className="text-base font-semibold">Contratar</h2></div>
            <p className="text-sm text-gray-600">Confirmar a contratação? O status passará para <strong>Contratado</strong>.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setContratarOpen(false)} disabled={saving}>Cancelar</Button>
              <Button disabled={saving} onClick={async () => { const ok = await save('contratado'); if (ok) setContratarOpen(false) }} className="gap-1.5">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}Contratar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Encerrar contrato */}
      {encerrarOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><UserMinus className="w-5 h-5 text-rose-600" /><h2 className="text-base font-semibold">Encerrar contrato</h2></div>
              <button onClick={() => setEncerrarOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-gray-600">
              {faltasNaoComp > 0
                ? <>Registradas <strong>{faltasNaoComp} falta{faltasNaoComp !== 1 ? 's' : ''}</strong> não compensada{faltasNaoComp !== 1 ? 's' : ''}. </>
                : <>Nenhuma falta não compensada registrada. </>}
              Valor final a pagar: <strong>{fmtBRL(aPagar)}</strong>. Encerrar o contrato? O status passará para <strong>Desligado</strong>.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEncerrarOpen(false)} disabled={saving}>Cancelar</Button>
              <Button variant="destructive" disabled={saving}
                onClick={async () => { const ok = await save('desligado', { faltas: faltasNaoComp }); if (ok) setEncerrarOpen(false) }}
                className="gap-1.5">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserMinus className="w-3.5 h-3.5" />}Encerrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function CalcRow({ label, value, muted, negative, positive }: { label: string; value: string; muted?: boolean; negative?: boolean; positive?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? 'text-muted-foreground text-[13px]' : 'text-gray-700'}>{label}</span>
      <span className={`font-medium ${negative ? 'text-red-600' : positive ? 'text-emerald-700' : muted ? 'text-muted-foreground' : 'text-gray-900'}`}>{value}</span>
    </div>
  )
}
