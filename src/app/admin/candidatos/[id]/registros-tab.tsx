'use client'
import { useState, useRef } from 'react'
import {
  Plus, Trash2, Loader2, X, Upload, FileText, FileDown, Download,
  CheckCircle2, AlertCircle, History,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/helpers'

export interface RecordItem {
  id: string
  record_date: string
  comment: string | null
  file_url: string | null
  file_name: string | null
  file_path: string | null
  created_at: string
}

interface Props { candidateId: string; initialRecords: RecordItem[] }

export function RegistrosTab({ candidateId, initialRecords }: Props) {
  const [records, setRecords] = useState<RecordItem[]>(initialRecords)
  const [modalOpen, setModalOpen] = useState(false)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [date, setDate] = useState('')
  const [comment, setComment] = useState('')
  const [file, setFile] = useState<{ url: string; name: string; path: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function showToast(type: 'ok' | 'err', msg: string) { setToast({ type, msg }); setTimeout(() => setToast(null), 4000) }
  function openModal() { setDate(new Date().toISOString().slice(0, 10)); setComment(''); setFile(null); setError(''); setModalOpen(true) }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return; setError('')
    if (f.size > 4 * 1024 * 1024) { setError('Arquivo excede 4 MB'); return }
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(f.type)) { setError('Use PDF, JPG ou PNG'); return }
    setUploading(true)
    const fd = new FormData(); fd.append('file', f); fd.append('docKey', 'registro')
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/admission-docs`, { method: 'POST', body: fd })
      const d = await res.json(); if (!res.ok) throw new Error(d.error)
      setFile({ url: d.url, name: f.name, path: d.path })
    } catch (e) { setError((e as Error).message || 'Erro no upload') }
    finally { setUploading(false); if (e.target) e.target.value = '' }
  }

  async function handleSave() {
    if (!date) { setError('Informe a data do registro.'); return }
    if (!comment.trim() && !file) { setError('Adicione um comentário ou anexo.'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/records`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record_date: date, comment, file_url: file?.url, file_name: file?.name, file_path: file?.path }),
      })
      const json = await res.json(); if (!res.ok) throw new Error(json.error)
      setRecords(prev => [json.record, ...prev].sort((a, b) => b.record_date.localeCompare(a.record_date)))
      setModalOpen(false)
      showToast('ok', 'Registro inserido.')
    } catch (e) { setError((e as Error).message || 'Erro ao salvar.') }
    finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este registro?')) return
    setDeletingId(id)
    const res = await fetch(`/api/admin/candidatos/${candidateId}/records/${id}`, { method: 'DELETE' })
    const json = await res.json(); setDeletingId(null)
    if (!res.ok) { showToast('err', json.error || 'Erro ao remover.'); return }
    setRecords(prev => prev.filter(r => r.id !== id))
    showToast('ok', 'Registro removido.')
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
          <History className="w-5 h-5 text-[#333]" />
          <div>
            <h2 className="text-base font-bold text-gray-900">Registros</h2>
            <p className="text-[12px] text-muted-foreground">{records.length} registro{records.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <Button onClick={openModal} className="gap-1.5 shrink-0"><Plus className="w-4 h-4" />Inserir registro</Button>
      </div>

      {records.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3 bg-white rounded-2xl border">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center"><History className="w-7 h-7 text-gray-300" /></div>
          <p className="font-medium text-gray-600">Nenhum registro</p>
        </div>
      ) : (
        // Linha cronológica (mais recente no topo)
        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <div className="relative space-y-4 before:absolute before:left-[11px] before:top-1 before:bottom-1 before:w-px before:bg-gray-200">
            {records.map(r => (
              <div key={r.id} className="relative flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 z-10">
                  <History className="w-3 h-3 text-emerald-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-gray-800">{formatDate(r.record_date)}</span>
                    <button onClick={() => handleDelete(r.id)} disabled={deletingId === r.id}
                      className="ml-auto text-gray-300 hover:text-red-500 shrink-0">
                      {deletingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  {r.comment && <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap">{r.comment}</p>}
                  {r.file_url && (
                    <a href={r.file_url} target="_blank" rel="noreferrer" download
                      className="inline-flex items-center gap-1.5 mt-1.5 text-[12px] text-emerald-700 hover:underline font-medium">
                      {r.file_name?.endsWith('.pdf') ? <FileText className="w-3.5 h-3.5 text-red-500" /> : <FileDown className="w-3.5 h-3.5 text-blue-500" />}
                      {r.file_name || 'Anexo'}<Download className="w-3 h-3 opacity-60" />
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="text-base font-semibold text-gray-900">Inserir registro</h2>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Data *</label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Comentário</label>
                <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3}
                  placeholder="Descreva o registro..."
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Anexo (PDF/JPG/PNG)</label>
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
                <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={handleFile} />
              </div>
              {error && <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl">
              <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving || uploading} className="gap-1.5">
                {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Salvando...</> : <><CheckCircle2 className="w-3.5 h-3.5" />Inserir</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
