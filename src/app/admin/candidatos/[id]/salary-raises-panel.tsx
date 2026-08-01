'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  TrendingUp, Plus, Trash2, Loader2, X, CheckCircle2, AlertCircle, CalendarDays,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/helpers'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface SalaryRaise {
  id: string
  raise_date: string   // ISO yyyy-mm-dd
  new_value: number
  created_at: string
}

interface Props {
  candidateId: string
  initialRaises: SalaryRaise[]
}

// ─── Moeda BR (mesmo padrão de dados-contrato-tab) ───────────────────────────

function maskBRL(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  return (Number(digits) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function parseBRL(str: string): number {
  if (!str) return 0
  return Number(str.replace(/\D/g, '')) / 100
}
function fmtBRL(num: number): string {
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function SalaryRaisesPanel({ candidateId, initialRaises }: Props) {
  const router = useRouter()
  const [raises, setRaises] = useState<SalaryRaise[]>(initialRaises)
  const [open, setOpen] = useState(false)
  const [raiseDate, setRaiseDate] = useState('')
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  function showToast(type: 'ok' | 'err', msg: string) {
    setToast({ type, msg }); setTimeout(() => setToast(null), 4000)
  }

  function openModal() {
    setRaiseDate(''); setValue(''); setError(''); setOpen(true)
  }

  async function handleSave() {
    setError('')
    if (!raiseDate) { setError('Informe a data do aumento.'); return }
    const num = parseBRL(value)
    if (num <= 0) { setError('Informe o novo valor do salário.'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/salary-raises`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raise_date: raiseDate, new_value: num }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Erro ao salvar.')
      setRaises(prev => [d.raise as SalaryRaise, ...prev]
        .sort((a, b) => b.raise_date.localeCompare(a.raise_date)))
      setOpen(false)
      showToast('ok', 'Aumento de salário registrado.')
      router.refresh() // atualiza Resumo + linha cronológica (server components)
    } catch (e) {
      setError((e as Error).message || 'Erro ao salvar.')
    } finally { setSaving(false) }
  }

  async function handleRemove(id: string) {
    if (!confirm('Remover este aumento de salário do histórico?')) return
    setRemoving(id)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/salary-raises/${id}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Erro ao remover.')
      setRaises(prev => prev.filter(r => r.id !== id))
      router.refresh()
    } catch (e) {
      showToast('err', (e as Error).message || 'Erro ao remover.')
    } finally { setRemoving(null) }
  }

  return (
    <>
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      <div className="bg-white rounded-2xl border shadow-sm p-5 sm:p-6 max-w-3xl">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            <h2 className="text-base font-bold text-gray-900">Aumentos de salário</h2>
          </div>
          <Button size="sm" onClick={openModal} className="gap-1.5 shrink-0">
            <Plus className="w-3.5 h-3.5" />Aumento de salário
          </Button>
        </div>

        {raises.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-2">Nenhum aumento registrado.</p>
        ) : (
          <div className="mt-3 space-y-1.5">
            {raises.map(r => (
              <div key={r.id} className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2">
                <CalendarDays className="w-4 h-4 text-emerald-500 shrink-0" />
                <span className="text-sm text-gray-700 flex-1 min-w-0">{formatDate(r.raise_date)}</span>
                <span className="text-sm font-semibold text-emerald-700 shrink-0">{fmtBRL(Number(r.new_value))}</span>
                <button
                  onClick={() => handleRemove(r.id)}
                  disabled={removing === r.id}
                  title="Remover"
                  className="text-gray-400 hover:text-red-500 shrink-0 disabled:opacity-50"
                >
                  {removing === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Popup: novo aumento ── */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
                <h2 className="text-base font-semibold">Aumento de salário</h2>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Data do aumento</label>
                <Input type="date" value={raiseDate} onChange={e => setRaiseDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Novo valor do salário</label>
                <Input value={value} onChange={e => setValue(maskBRL(e.target.value))} inputMode="numeric" placeholder="R$ 0.000,00" />
              </div>
              {error && (
                <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TrendingUp className="w-3.5 h-3.5" />}Registrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
