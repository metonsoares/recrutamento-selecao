'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRightLeft, Building2, ChevronDown, ChevronUp, Loader2, X, AlertCircle,
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

export function ArchivedFicha({ title, subtitle, children }: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="max-w-3xl rounded-2xl border border-gray-200 bg-gray-50 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2.5 px-4 sm:px-5 py-3.5 text-left hover:bg-gray-100 transition-colors"
      >
        <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-gray-700 truncate">{title}</span>
          {subtitle && <span className="block text-[11px] text-muted-foreground">{subtitle}</span>}
        </span>
        <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-wide text-gray-400 bg-gray-200/70 rounded-full px-2 py-0.5 shrink-0">
          Somente leitura
        </span>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
      </button>
      {expanded && <div className="border-t p-3 sm:p-4">{children}</div>}
    </div>
  )
}
