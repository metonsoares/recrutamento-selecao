'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRightLeft, Building2, ChevronDown, ChevronUp, Loader2, X, AlertCircle, Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

// ─── Transferir de empresa ────────────────────────────────────────────────────
// Arquiva a ficha ATUAL (vira seção recolhível somente leitura) e mantém a
// ficha ativa editável — o usuário troca a Empresa contratante em seguida.

export function TransferCompanySection({ candidateId, hasFicha }: { candidateId: string; hasFicha: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleTransfer() {
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/transfer-company`, { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Erro ao transferir.')
      setOpen(false)
      router.refresh()
    } catch (e) {
      setError((e as Error).message || 'Erro ao transferir.')
    } finally { setSaving(false) }
  }

  return (
    <>
      <div className="max-w-3xl rounded-2xl border bg-white shadow-sm p-4 sm:p-5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2.5 flex-1 min-w-[220px]">
          <ArrowRightLeft className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-gray-900">Transferência de empresa</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Arquiva a ficha atual como histórico (somente leitura) e mantém uma nova ficha ativa para você trocar a empresa contratante.
            </p>
          </div>
        </div>
        <Button
          variant="outline" size="sm" onClick={() => { setError(''); setOpen(true) }}
          disabled={!hasFicha}
          title={hasFicha ? undefined : 'Salve a ficha antes de transferir.'}
          className="gap-1.5 shrink-0 border-teal-300 text-teal-700 hover:bg-teal-50"
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />Transferir de empresa
        </Button>
      </div>

      {/* ── Confirmação ── */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-teal-600" />
                <h2 className="text-base font-semibold">Transferir de empresa</h2>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="text-sm text-gray-600 space-y-2">
              <p>
                A ficha atual será <strong>arquivada</strong> e passará a aparecer abaixo como uma seção
                recolhível <strong>somente leitura</strong>.
              </p>
              <p>
                A ficha ativa continua com <strong>todos os dados copiados</strong> — após confirmar, altere a
                <strong> Empresa contratante</strong> (e o que mais for necessário) e salve a ficha.
              </p>
              <p>O status do funcionário permanece <strong>Contratado</strong>.</p>
            </div>
            {error && (
              <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleTransfer} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRightLeft className="w-3.5 h-3.5" />}Transferir
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Ficha arquivada (recolhível, somente leitura) ────────────────────────────

export function ArchivedFicha({ title, subtitle, candidateId, arquivadaEm, children }: {
  title: string
  subtitle?: string
  candidateId: string
  arquivadaEm?: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function handleDelete() {
    setDeleting(true); setError('')
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/transfer-company`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arquivada_em: arquivadaEm }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Erro ao excluir.')
      setConfirming(false)
      router.refresh()
    } catch (e) {
      setError((e as Error).message || 'Erro ao excluir.')
    } finally { setDeleting(false) }
  }

  const toggle = () => setExpanded(e => !e)

  return (
    <div className="max-w-3xl rounded-2xl border border-gray-200 bg-gray-50 overflow-hidden">
      <div className="w-full flex items-center gap-2.5 px-4 sm:px-5 py-3.5">
        <button
          type="button"
          onClick={toggle}
          className="flex items-center gap-2.5 flex-1 min-w-0 text-left hover:opacity-70 transition-opacity"
        >
          <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-gray-700 truncate">{title}</span>
            {subtitle && <span className="block text-[11px] text-muted-foreground">{subtitle}</span>}
          </span>
        </button>
        <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-wide text-gray-400 bg-gray-200/70 rounded-full px-2 py-0.5 shrink-0">
          Somente leitura
        </span>
        {arquivadaEm && (
          <button
            type="button"
            onClick={() => { setError(''); setConfirming(true) }}
            title="Excluir esta ficha anterior"
            className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg px-2 py-1 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /><span className="hidden sm:inline">Excluir</span>
          </button>
        )}
        <button type="button" onClick={toggle} className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>
      {expanded && <div className="border-t p-3 sm:p-4">{children}</div>}

      {/* Alerta de exclusão (modal estilizado; o confirm() nativo é suprimido no tablet embarcado) */}
      {confirming && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => { if (!deleting) setConfirming(false) }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 px-5 py-4 border-b">
              <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center shrink-0"><Trash2 className="w-4 h-4 text-red-600" /></div>
              <h2 className="text-base font-semibold text-gray-900">Excluir ficha anterior</h2>
            </div>
            <div className="px-5 py-4 text-sm text-gray-600">
              Excluir <strong>{title}</strong>?
              <span className="block mt-1 text-gray-500">Esta ação remove a ficha arquivada permanentemente e não pode ser desfeita.</span>
            </div>
            {error && (
              <p className="px-5 -mt-1 pb-2 text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>
            )}
            <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl">
              <Button variant="outline" onClick={() => setConfirming(false)} disabled={deleting}>Cancelar</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="gap-1.5">
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}Excluir
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
