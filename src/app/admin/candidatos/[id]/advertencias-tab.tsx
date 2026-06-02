'use client'
import { useState, useRef } from 'react'
import {
  Plus, Pencil, Trash2, Loader2, X, Upload, FileDown,
  AlertTriangle, CheckCircle2, AlertCircle, FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/helpers'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Warning {
  id: string
  occurred_at: string
  reason: string
  file_url: string | null
  file_name: string | null
  file_path: string | null
  created_at: string
}

interface Props {
  candidateId: string
  initialWarnings: Warning[]
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ─── Form (add/edit) ──────────────────────────────────────────────────────────

interface FormData {
  occurred_at: string
  reason: string
  file_url: string | null
  file_name: string | null
  file_path: string | null
}

function WarningForm({
  candidateId, initial, onSave, onClose,
}: {
  candidateId: string
  initial: FormData
  onSave: (d: FormData) => Promise<void>
  onClose: () => void
}) {
  const [data, setData] = useState<FormData>(initial)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    if (file.size > 4 * 1024 * 1024) { setError('Arquivo excede 4 MB'); return }
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
      setError('Use PDF, JPG ou PNG'); return
    }
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('docKey', 'advertencia')
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/admission-docs`, { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setData(prev => ({ ...prev, file_url: d.url, file_name: file.name, file_path: d.path }))
    } catch (err) {
      setError((err as Error).message || 'Erro no upload')
    } finally {
      setUploading(false)
      if (e.target) e.target.value = ''
    }
  }

  async function handleSubmit() {
    if (!data.occurred_at) { setError('Informe a data do ocorrido.'); return }
    if (!data.reason.trim()) { setError('Informe o motivo da advertência.'); return }
    setSaving(true)
    setError('')
    try {
      await onSave(data)
    } catch (e) {
      setError((e as Error).message || 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="px-5 py-4 space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">Data do ocorrido *</label>
          <Input type="date" value={data.occurred_at} onChange={e => setData(p => ({ ...p, occurred_at: e.target.value }))} />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">Motivo da advertência *</label>
          <textarea
            value={data.reason}
            onChange={e => setData(p => ({ ...p, reason: e.target.value }))}
            rows={3}
            placeholder="Descreva o motivo da advertência..."
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">Arquivo da advertência assinada (PDF/JPG/PNG)</label>
          {data.file_url ? (
            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-300 rounded-lg px-2.5 py-1.5">
              <FileText className="w-4 h-4 text-red-500 shrink-0" />
              <a href={data.file_url} target="_blank" rel="noreferrer" className="text-[12px] text-emerald-700 hover:underline truncate flex-1">
                {data.file_name}
              </a>
              <button onClick={() => setData(p => ({ ...p, file_url: null, file_name: null, file_path: null }))}
                className="text-gray-400 hover:text-red-500 shrink-0"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <button
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-primary hover:text-primary transition-colors disabled:opacity-50 w-full justify-center"
            >
              {uploading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Enviando...</> : <><Upload className="w-3.5 h-3.5" />Anexar arquivo</>}
            </button>
          )}
          <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={handleFile} />
        </div>

        {error && <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</p>}
      </div>

      <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl">
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button onClick={handleSubmit} disabled={saving} className="gap-1.5">
          {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Salvando...</> : <><CheckCircle2 className="w-3.5 h-3.5" />Salvar</>}
        </Button>
      </div>
    </>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

const EMPTY: FormData = { occurred_at: '', reason: '', file_url: null, file_name: null, file_path: null }

export function AdvertenciasTab({ candidateId, initialWarnings }: Props) {
  const [warnings, setWarnings] = useState<Warning[]>(initialWarnings)
  const [modal, setModal] = useState<'add' | 'edit' | 'delete' | null>(null)
  const [selected, setSelected] = useState<Warning | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  function showToast(type: 'ok' | 'err', msg: string) {
    setToast({ type, msg }); setTimeout(() => setToast(null), 4000)
  }

  async function handleAdd(d: FormData) {
    const res = await fetch(`/api/admin/candidatos/${candidateId}/warnings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error)
    setWarnings(prev => [json.warning, ...prev].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)))
    setModal(null)
    showToast('ok', 'Advertência registrada.')
  }

  async function handleEdit(d: FormData) {
    if (!selected) return
    const res = await fetch(`/api/admin/candidatos/${candidateId}/warnings/${selected.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error)
    setWarnings(prev => prev.map(w => w.id === selected.id ? json.warning : w).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)))
    setModal(null)
    showToast('ok', 'Advertência atualizada.')
  }

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)
    const res = await fetch(`/api/admin/candidatos/${candidateId}/warnings/${selected.id}`, { method: 'DELETE' })
    const json = await res.json()
    setDeleting(false)
    if (!res.ok) { showToast('err', json.error || 'Erro ao remover.'); setModal(null); return }
    setWarnings(prev => prev.filter(w => w.id !== selected.id))
    setModal(null)
    showToast('ok', 'Advertência removida.')
  }

  return (
    <div className="max-w-3xl space-y-4">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <div>
            <h2 className="text-base font-bold text-gray-900">Advertências</h2>
            <p className="text-[12px] text-muted-foreground">
              {warnings.length} advertência{warnings.length !== 1 ? 's' : ''} registrada{warnings.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <Button onClick={() => { setSelected(null); setModal('add') }} className="gap-1.5 shrink-0">
          <Plus className="w-4 h-4" />
          Nova advertência
        </Button>
      </div>

      {/* Tabela / vazio */}
      {warnings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3 bg-white rounded-2xl border">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-gray-300" />
          </div>
          <div>
            <p className="font-medium text-gray-600">Nenhuma advertência</p>
            <p className="text-sm text-muted-foreground mt-1">Este colaborador não possui advertências registradas.</p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs text-muted-foreground uppercase tracking-wide">
                <th className="px-4 py-3 text-left font-medium w-32">Data</th>
                <th className="px-4 py-3 text-left font-medium">Motivo</th>
                <th className="px-4 py-3 text-center font-medium w-40">Arquivo</th>
                <th className="px-4 py-3 text-right font-medium w-24">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {warnings.map(w => (
                <tr key={w.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatDate(w.occurred_at)}</td>
                  <td className="px-4 py-3 text-gray-700">
                    <p className="line-clamp-2">{w.reason}</p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {w.file_url ? (
                      <a href={w.file_url} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors">
                        <FileDown className="w-3.5 h-3.5" />
                        Exportar PDF
                      </a>
                    ) : (
                      <span className="text-xs text-gray-300">Sem arquivo</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => { setSelected(w); setModal('edit') }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors" title="Editar">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => { setSelected(w); setModal('delete') }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Remover">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal add */}
      {modal === 'add' && (
        <Modal title="Nova advertência" onClose={() => setModal(null)}>
          <WarningForm candidateId={candidateId} initial={EMPTY} onSave={handleAdd} onClose={() => setModal(null)} />
        </Modal>
      )}

      {/* Modal edit */}
      {modal === 'edit' && selected && (
        <Modal title="Editar advertência" onClose={() => setModal(null)}>
          <WarningForm
            candidateId={candidateId}
            initial={{
              occurred_at: selected.occurred_at,
              reason: selected.reason,
              file_url: selected.file_url,
              file_name: selected.file_name,
              file_path: selected.file_path,
            }}
            onSave={handleEdit}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}

      {/* Modal delete */}
      {modal === 'delete' && selected && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Remover advertência</h2>
            <p className="text-sm text-gray-600">
              Remover a advertência de <strong>{formatDate(selected.occurred_at)}</strong>? Esta ação é irreversível.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setModal(null)} disabled={deleting}>Cancelar</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="gap-1.5">
                {deleting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Removendo...</> : <><Trash2 className="w-3.5 h-3.5" />Remover</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
