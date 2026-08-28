'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Briefcase, Plus, Trash2, Loader2, X, CheckCircle2, AlertCircle, CalendarDays, ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/helpers'

export interface RoleChange {
  id: string
  change_date: string          // yyyy-mm-dd
  previous_title: string | null
  new_title: string
  comment: string | null
  created_by: string | null
  created_at: string
}

interface Props {
  candidateId: string
  initialChanges: RoleChange[]
  /** Função que está valendo hoje, vinda da ficha. */
  funcaoAtual: string | null
}

/**
 * Mudanças de função — mesmo desenho de "Aumentos de salário".
 *
 * Registrar uma troca atualiza a função da ficha E guarda a linha do tempo,
 * com a função anterior anotada em cada passo. Trocar não apaga o passado.
 */
export function RoleChangesPanel({ candidateId, initialChanges, funcaoAtual }: Props) {
  const router = useRouter()
  const [changes, setChanges] = useState<RoleChange[]>(initialChanges)
  const [open, setOpen] = useState(false)
  const [changeDate, setChangeDate] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  function showToast(type: 'ok' | 'err', msg: string) {
    setToast({ type, msg }); setTimeout(() => setToast(null), 4000)
  }

  function openModal() {
    setChangeDate(''); setNewTitle(''); setComment(''); setError(''); setOpen(true)
  }

  async function handleSave() {
    setError('')
    if (!changeDate) { setError('Informe a data da mudança.'); return }
    if (!newTitle.trim()) { setError('Informe a nova função.'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/role-changes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ change_date: changeDate, new_title: newTitle.trim(), comment }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Erro ao registrar a mudança.')
      setChanges(prev => [d.change as RoleChange, ...prev])
      setOpen(false)
      showToast('ok', 'Mudança de função registrada.')
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally { setSaving(false) }
  }

  async function handleRemove(id: string) {
    setRemoving(id)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/role-changes/${id}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Erro ao remover.')
      setChanges(prev => prev.filter(c => c.id !== id))
      showToast('ok', 'Registro removido. A função da ficha não mudou.')
      router.refresh()
    } catch (e) {
      showToast('err', (e as Error).message)
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
            <Briefcase className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-bold text-gray-900">Mudança de função</h2>
          </div>
          <Button size="sm" onClick={openModal} className="gap-1.5 shrink-0">
            <Plus className="w-3.5 h-3.5" />Mudar de função
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          Função atual: <strong className="text-gray-800">{funcaoAtual?.trim() || '— não informada na ficha'}</strong>
        </p>

        {changes.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-2">Nenhuma mudança registrada.</p>
        ) : (
          <div className="mt-3 space-y-1.5">
            {changes.map(c => (
              <div key={c.id} className="rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span className="text-sm text-gray-700 shrink-0">{formatDate(c.change_date)}</span>
                  <span className="flex-1 min-w-0 text-sm text-gray-800 flex items-center gap-1.5 flex-wrap">
                    {c.previous_title && (
                      <>
                        <span className="text-muted-foreground line-through">{c.previous_title}</span>
                        <ArrowRight className="w-3 h-3 text-indigo-400 shrink-0" />
                      </>
                    )}
                    <strong className="text-indigo-800">{c.new_title}</strong>
                  </span>
                  <button
                    onClick={() => handleRemove(c.id)}
                    disabled={removing === c.id}
                    title="Remover este registro"
                    className="text-gray-400 hover:text-red-500 shrink-0 disabled:opacity-50"
                  >
                    {removing === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
                {c.comment && (
                  <p className="text-[12px] text-gray-600 mt-1 ml-6">{c.comment}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Popup: nova mudança ── */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-indigo-600" />
                <h2 className="text-base font-semibold">Mudança de função</h2>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-3">
              <p className="text-[12.5px] text-muted-foreground">
                Sai de <strong className="text-gray-700">{funcaoAtual?.trim() || '(sem função na ficha)'}</strong>.
                A ficha passa a mostrar a nova função e esta troca fica no histórico.
              </p>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Data da mudança</label>
                <Input type="date" value={changeDate} onChange={e => setChangeDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Nova função</label>
                <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Ex.: Supervisor Comercial" />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Observação <span className="font-normal normal-case text-muted-foreground">(opcional)</span>
                </label>
                <Input value={comment} onChange={e => setComment(e.target.value)} placeholder="Ex.: promoção" />
              </div>
              {error && (
                <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Briefcase className="w-3.5 h-3.5" />}Registrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
