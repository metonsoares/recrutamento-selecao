'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Loader2, Save, CheckCircle2, AlertCircle, Plus, Trash2,
  FileSignature, X, UserCheck, UserMinus, TrendingUp, TrendingDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Adjustment { id: string; type: 'adiantamento' | 'desconto'; description: string; value: string }

export interface ContractData {
  start_date: string
  days: string
  end_date: string
  funcao: string
  valor: string
  adjustments: Adjustment[]
  faltas?: number
}

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
  return { start_date: '', days: '', end_date: '', funcao: jobTitle || '', valor: '', adjustments: [] }
}

export function DadosContratoTab({ candidateId, fullName, cpf, address, jobTitle, initialData }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<ContractData>(initialData ?? makeEmpty(jobTitle))
  const [saving, setSaving] = useState(false)
  const [encerrarOpen, setEncerrarOpen] = useState(false)
  const [contratarOpen, setContratarOpen] = useState(false)
  const [teveFaltas, setTeveFaltas] = useState(false)
  const [qtdFaltas, setQtdFaltas] = useState('0')
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  function set<K extends keyof ContractData>(k: K, v: ContractData[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  // Recalcula término ao mudar início ou dias
  function setStart(v: string) {
    setForm(prev => ({ ...prev, start_date: v, end_date: prev.days ? addDays(v, parseInt(prev.days) || 0) : prev.end_date }))
  }
  function setDays(v: string) {
    setForm(prev => ({ ...prev, days: v, end_date: prev.start_date ? addDays(prev.start_date, parseInt(v) || 0) : prev.end_date }))
  }

  function addAdjustment(type: 'adiantamento' | 'desconto') {
    setForm(prev => ({ ...prev, adjustments: [...prev.adjustments, { id: genId(), type, description: '', value: '' }] }))
  }
  function updateAdjustment(id: string, patch: Partial<Adjustment>) {
    setForm(prev => ({ ...prev, adjustments: prev.adjustments.map(a => a.id === id ? { ...a, ...patch } : a) }))
  }
  function removeAdjustment(id: string) {
    setForm(prev => ({ ...prev, adjustments: prev.adjustments.filter(a => a.id !== id) }))
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

  return (
    <>
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      <div className="bg-white rounded-2xl border shadow-sm p-6 sm:p-8 space-y-0 max-w-3xl">
        <div className="flex items-center gap-2 mb-5">
          <FileSignature className="w-5 h-5 text-teal-600" />
          <h2 className="text-xl font-bold text-gray-900">Dados para contrato</h2>
        </div>

        {/* Dados do candidato (somente leitura) */}
        <div className="grid grid-cols-1 gap-3">
          {field('Nome completo',
            <div className="h-9 flex items-center px-3 border border-gray-200 rounded-md bg-gray-50 text-sm font-medium">{fullName}</div>)}
          <div className="grid grid-cols-2 gap-3">
            {field('CPF',
              <div className="h-9 flex items-center px-3 border border-gray-200 rounded-md bg-gray-50 text-sm text-gray-700">{cpf || '—'}</div>)}
            {field('CEP',
              <div className="h-9 flex items-center px-3 border border-gray-200 rounded-md bg-gray-50 text-sm text-gray-700">{address?.cep || '—'}</div>)}
          </div>
          {field('Endereço completo',
            <div className="min-h-9 flex items-center px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-sm text-gray-700">{enderecoCompleto}</div>)}
        </div>

        {/* Dados do contrato (editáveis) */}
        <div className="flex items-center gap-2 mt-6 mb-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400 whitespace-nowrap">Contrato</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div className="grid grid-cols-3 gap-3">
            {field('Data de início',
              <Input type="date" value={form.start_date} onChange={e => setStart(e.target.value)} />)}
            {field('Período (dias)',
              <Input type="number" min={1} value={form.days} onChange={e => setDays(e.target.value)} placeholder="Ex: 30" />)}
            {field('Data de término',
              <Input type="date" value={form.end_date} readOnly className="bg-gray-50 text-gray-600" />)}
          </div>
          {field('Função a exercer no contrato',
            <Input value={form.funcao} onChange={e => set('funcao', e.target.value)} placeholder="Ex: Garçom para evento" />)}
          {field('Valor de contrato (R$)',
            <Input value={form.valor} onChange={e => set('valor', e.target.value)} placeholder="R$ 0,00" />)}
        </div>

        {/* Adiantamentos e descontos */}
        <div className="flex items-center gap-2 mt-6 mb-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400 whitespace-nowrap">Adiantamentos e descontos</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <div className="space-y-2">
          {form.adjustments.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">Nenhum lançamento.</p>
          )}
          {form.adjustments.map(a => (
            <div key={a.id} className={`flex items-center gap-2 rounded-lg border p-2 ${a.type === 'adiantamento' ? 'bg-blue-50/50 border-blue-200' : 'bg-rose-50/50 border-rose-200'}`}>
              <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${a.type === 'adiantamento' ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'}`}>
                {a.type === 'adiantamento' ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                {a.type === 'adiantamento' ? 'Adiant.' : 'Desconto'}
              </span>
              <Input value={a.description} onChange={e => updateAdjustment(a.id, { description: e.target.value })} placeholder="Descrição" className="h-8 text-sm flex-1" />
              <Input value={a.value} onChange={e => updateAdjustment(a.id, { value: e.target.value })} placeholder="R$ 0,00" className="h-8 text-sm w-28" />
              <button onClick={() => removeAdjustment(a.id)} className="text-gray-400 hover:text-red-500 shrink-0"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => addAdjustment('adiantamento')} className="gap-1.5 text-blue-700 border-blue-300 hover:bg-blue-50">
              <Plus className="w-3.5 h-3.5" />Adiantamento
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => addAdjustment('desconto')} className="gap-1.5 text-rose-700 border-rose-300 hover:bg-rose-50">
              <Plus className="w-3.5 h-3.5" />Desconto
            </Button>
          </div>
        </div>
      </div>

      {/* Ações */}
      <div className="mt-4 max-w-3xl flex flex-wrap gap-2">
        <Button onClick={() => save()} disabled={saving} variant="outline" className="gap-1.5">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Salvando...</> : <><Save className="w-4 h-4" />Salvar</>}
        </Button>
        <Button onClick={() => setContratarOpen(true)} disabled={saving} className="gap-1.5">
          <UserCheck className="w-4 h-4" />Contratar
        </Button>
        <Button onClick={() => { setTeveFaltas(false); setQtdFaltas('0'); setEncerrarOpen(true) }} disabled={saving} variant="outline" className="gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-50">
          <UserMinus className="w-4 h-4" />Encerrar contrato
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
            <p className="text-sm text-gray-600">O colaborador teve alguma falta durante o contrato?</p>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                <input type="radio" checked={teveFaltas} onChange={() => setTeveFaltas(true)} className="accent-primary" />Sim
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                <input type="radio" checked={!teveFaltas} onChange={() => setTeveFaltas(false)} className="accent-primary" />Não
              </label>
            </div>
            {teveFaltas && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Quantas faltas?</label>
                <Input type="number" min={1} value={qtdFaltas} onChange={e => setQtdFaltas(e.target.value)} />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEncerrarOpen(false)} disabled={saving}>Cancelar</Button>
              <Button variant="destructive" disabled={saving}
                onClick={async () => {
                  const faltas = teveFaltas ? (parseInt(qtdFaltas) || 0) : 0
                  const ok = await save('desligado', { faltas })
                  if (ok) setEncerrarOpen(false)
                }}
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
