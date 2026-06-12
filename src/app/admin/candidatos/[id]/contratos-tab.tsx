'use client'
import { useState, useRef } from 'react'
import {
  Plus, Trash2, Loader2, X, Upload, FileText, FileDown, Download,
  CheckCircle2, AlertCircle, FileSignature,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/helpers'

export interface ContractItem {
  id: string
  title: string
  contract_date: string
  period_start: string | null
  period_end: string | null
  value: number | null
  notes: string | null
  file_url: string | null
  file_name: string | null
  file_path: string | null
  created_at: string
}

interface Props { candidateId: string; initialContracts: ContractItem[] }

function brl(v: number | null) {
  if (v == null) return null
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function ContratosTab({ candidateId, initialContracts }: Props) {
  const [contracts, setContracts] = useState<ContractItem[]>(initialContracts)
  const [modalOpen, setModalOpen] = useState(false)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [value, setValue] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<{ url: string; name: string; path: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function showToast(type: 'ok' | 'err', msg: string) { setToast({ type, msg }); setTimeout(() => setToast(null), 4000) }
  function openModal() {
    setTitle(''); setDate(new Date().toISOString().slice(0, 10)); setStart(''); setEnd(''); setValue(''); setNotes(''); setFile(null); setError(''); setModalOpen(true)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return; setError('')
    if (f.size > 15 * 1024 * 1024) { setError('Arquivo excede 15 MB.'); return }
    setUploading(true)
    const fd = new FormData(); fd.append('file', f); fd.append('docKey', 'contrato')
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/admission-docs`, { method: 'POST', body: fd })
      const d = await res.json(); if (!res.ok) throw new Error(d.error)
      setFile({ url: d.url, name: f.name, path: d.path })
    } catch (e) { setError((e as Error).message || 'Erro no upload') }
    finally { setUploading(false); if (e.target) e.target.value = '' }
  }

  async function handleSave() {
    setError('')
    if (!title.trim()) { setError('Informe o título do contrato.'); return }
    if (!date) { setError('Informe a data do contrato.'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/contratos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, contract_date: date, period_start: start || null, period_end: end || null,
          value, notes, file_url: file?.url, file_name: file?.name, file_path: file?.path,
        }),
      })
      const d = await res.json(); if (!res.ok) throw new Error(d.error)
      setContracts(prev => [d.contract, ...prev].sort((a, b) => b.contract_date.localeCompare(a.contract_date)))
      setModalOpen(false)
      showToast('ok', 'Contrato adicionado.')
    } catch (e) { setError((e as Error).message || 'Erro ao salvar.') }
    finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este contrato?')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/contratos/${id}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { showToast('err', d.error || 'Erro ao remover.'); return }
      setContracts(prev => prev.filter(c => c.id !== id))
      showToast('ok', 'Contrato removido.')
    } finally { setDeletingId(null) }
  }

  return (
    <div className="max-w-3xl space-y-4">
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}{toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <FileSignature className="w-5 h-5 text-[#333]" />
          <div>
            <h2 className="text-base font-bold text-gray-900">Contratos</h2>
            <p className="text-[12px] text-muted-foreground">{contracts.length} contrato{contracts.length !== 1 ? 's' : ''} realizado{contracts.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <Button onClick={openModal} className="gap-1.5 shrink-0"><Plus className="w-4 h-4" />Adicionar contrato</Button>
      </div>

      {contracts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3 bg-white rounded-2xl border">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center"><FileSignature className="w-7 h-7 text-gray-300" /></div>
          <p className="font-medium text-gray-600">Nenhum contrato</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <div className="relative space-y-4 before:absolute before:left-[11px] before:top-1 before:bottom-1 before:w-px before:bg-gray-200">
            {contracts.map(c => (
              <div key={c.id} className="relative flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-sky-100 flex items-center justify-center shrink-0 z-10">
                  <FileSignature className="w-3 h-3 text-sky-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[12px] font-semibold text-gray-800">{formatDate(c.contract_date)}</span>
                    <span className="text-sm font-medium text-gray-900">{c.title}</span>
                    {c.value != null && <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">{brl(c.value)}</span>}
                    <button onClick={() => handleDelete(c.id)} disabled={deletingId === c.id}
                      className="ml-auto text-gray-300 hover:text-red-500 shrink-0">
                      {deletingId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  {(c.period_start || c.period_end) && (
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      Período: {c.period_start ? formatDate(c.period_start) : '—'} a {c.period_end ? formatDate(c.period_end) : '—'}
                    </p>
                  )}
                  {c.notes && <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap">{c.notes}</p>}
                  {c.file_url && (
                    <a href={c.file_url} target="_blank" rel="noreferrer" download
                      className="inline-flex items-center gap-1.5 mt-1.5 text-[12px] text-sky-700 hover:underline font-medium">
                      {c.file_name?.endsWith('.pdf') ? <FileText className="w-3.5 h-3.5 text-red-500" /> : <FileDown className="w-3.5 h-3.5 text-blue-500" />}
                      {c.file_name || 'Contrato'}<Download className="w-3 h-3 opacity-60" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
              <h2 className="text-base font-semibold text-gray-900">Adicionar contrato</h2>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Título / tipo do contrato *</label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Contrato de prestação de serviço - Evento X" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1"><label className="text-xs font-medium text-gray-600">Data *</label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
                <div className="w-32 space-y-1"><label className="text-xs font-medium text-gray-600">Valor (R$)</label><Input type="number" value={value} onChange={e => setValue(e.target.value)} placeholder="0,00" /></div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1"><label className="text-xs font-medium text-gray-600">Início (opcional)</label><Input type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
                <div className="flex-1 space-y-1"><label className="text-xs font-medium text-gray-600">Término (opcional)</label><Input type="date" value={end} onChange={e => setEnd(e.target.value)} /></div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Observações</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Arquivo do contrato (PDF/DOC/imagem)</label>
                {file ? (
                  <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-300 rounded-lg px-2.5 py-1.5">
                    <FileText className="w-4 h-4 text-red-500 shrink-0" />
                    <a href={file.url} target="_blank" rel="noreferrer" className="text-[12px] text-emerald-700 hover:underline truncate flex-1">{file.name}</a>
                    <button onClick={() => setFile(null)} className="text-gray-400 hover:text-red-500 shrink-0"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <button disabled={uploading} onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-primary hover:text-primary transition-colors disabled:opacity-50 w-full justify-center">
                    {uploading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Enviando...</> : <><Upload className="w-3.5 h-3.5" />Anexar arquivo</>}
                  </button>
                )}
                <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,.doc,.docx" className="hidden" onChange={handleFile} />
              </div>
              {error && <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl sticky bottom-0">
              <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving || uploading} className="gap-1.5">
                {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Salvando...</> : <><CheckCircle2 className="w-3.5 h-3.5" />Adicionar</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
