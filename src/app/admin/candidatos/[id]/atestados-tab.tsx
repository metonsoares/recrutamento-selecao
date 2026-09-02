'use client'
import { useState, useRef } from 'react'
import {
  Plus, Pencil, Trash2, Loader2, X, Upload, FileDown, FileText,
  Stethoscope, CheckCircle2, AlertCircle, Download,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/helpers'
import { abrirArquivoAssinado } from '@/lib/abrir-arquivo'
import { VerArquivo } from '@/components/ver-arquivo'

const MAX_MB = 3

interface Certificate {
  id: string
  certificate_date: string
  file_url: string | null
  file_name: string | null
  file_path: string | null
  comment: string | null
  created_at: string
}

interface Props {
  candidateId: string
  initialCertificates: Certificate[]
}

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

export function AtestadosTab({ candidateId, initialCertificates }: Props) {
  const [certs, setCerts] = useState<Certificate[]>(initialCertificates)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // form state
  const [date, setDate] = useState('')
  const [comment, setComment] = useState('')
  const [file, setFile] = useState<{ url: string; name: string; path: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function showToast(type: 'ok' | 'err', msg: string) { setToast({ type, msg }); setTimeout(() => setToast(null), 4000) }

  function openModal() {
    setEditingId(null)
    setDate(''); setComment(''); setFile(null); setError('')
    setModalOpen(true)
  }

  function openEdit(c: Certificate) {
    setEditingId(c.id)
    setDate(c.certificate_date)
    setComment(c.comment || '')
    setFile(c.file_url ? { url: c.file_url, name: c.file_name || 'Atestado', path: c.file_path || '' } : null)
    setError('')
    setModalOpen(true)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setError('')
    if (f.size > MAX_MB * 1024 * 1024) { setError(`Arquivo excede ${MAX_MB} MB`); return }
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(f.type)) { setError('Use PDF, JPG ou PNG'); return }
    setUploading(true)
    const fd = new FormData()
    fd.append('file', f)
    fd.append('docKey', 'atestado')
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/admission-docs`, { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setFile({ url: d.url, name: f.name, path: d.path })
    } catch (err) {
      setError((err as Error).message || 'Erro no upload')
    } finally {
      setUploading(false)
      if (e.target) e.target.value = ''
    }
  }

  async function handleSave() {
    if (!date) { setError('Informe a data do atestado.'); return }
    setSaving(true)
    setError('')
    try {
      const isEdit = editingId !== null
      const url = isEdit
        ? `/api/admin/candidatos/${candidateId}/certificates/${editingId}`
        : `/api/admin/candidatos/${candidateId}/certificates`
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          certificate_date: date, comment,
          file_url: file?.url ?? null, file_name: file?.name ?? null, file_path: file?.path || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setCerts(prev =>
        (isEdit ? prev.map(c => c.id === editingId ? json.certificate : c) : [json.certificate, ...prev])
          .sort((a, b) => b.certificate_date.localeCompare(a.certificate_date)))
      setModalOpen(false)
      showToast('ok', isEdit ? 'Atestado atualizado.' : 'Atestado inserido.')
    } catch (e) {
      setError((e as Error).message || 'Erro ao salvar.')
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este atestado?')) return
    setDeletingId(id)
    const res = await fetch(`/api/admin/candidatos/${candidateId}/certificates/${id}`, { method: 'DELETE' })
    const json = await res.json()
    setDeletingId(null)
    if (!res.ok) { showToast('err', json.error || 'Erro ao remover.'); return }
    setCerts(prev => prev.filter(c => c.id !== id))
    showToast('ok', 'Atestado removido.')
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
          <Stethoscope className="w-5 h-5 text-[#333]" />
          <div>
            <h2 className="text-base font-bold text-gray-900">Atestados</h2>
            <p className="text-[12px] text-muted-foreground">
              {certs.length} atestado{certs.length !== 1 ? 's' : ''} registrado{certs.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <Button onClick={openModal} className="gap-1.5 shrink-0">
          <Plus className="w-4 h-4" />
          Inserir atestado
        </Button>
      </div>

      {/* Tabela / vazio */}
      {certs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3 bg-white rounded-2xl border">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
            <Stethoscope className="w-7 h-7 text-gray-300" />
          </div>
          <div>
            <p className="font-medium text-gray-600">Nenhum atestado</p>
            <p className="text-sm text-muted-foreground mt-1">Clique em &ldquo;Inserir atestado&rdquo; para adicionar.</p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs text-muted-foreground uppercase tracking-wide">
                <th className="px-4 py-3 text-left font-medium w-36">Data</th>
                <th className="px-4 py-3 text-left font-medium">Arquivo</th>
                <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Observação</th>
                <th className="px-4 py-3 text-right font-medium w-20">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {certs.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatDate(c.certificate_date)}</td>
                  <td className="px-4 py-3">
                    {/* O nome baixa; o olho abre para conferir. */}
                    <div className="flex items-center gap-1">
                      {c.file_url ? (
                        <>
                          <a href={c.file_url ?? undefined} onClick={e => abrirArquivoAssinado(e, { url: c.file_url, path: c.file_path, name: c.file_name })}
                            target="_blank" rel="noreferrer" download
                            className="inline-flex items-center gap-1.5 text-sm text-emerald-700 hover:underline font-medium min-w-0">
                            {c.file_name?.endsWith('.pdf')
                              ? <FileText className="w-4 h-4 text-red-500 shrink-0" />
                              : <FileDown className="w-4 h-4 text-blue-500 shrink-0" />}
                            <span className="truncate max-w-[220px]">{c.file_name || 'Atestado'}</span>
                            <Download className="w-3.5 h-3.5 opacity-60" />
                          </a>
                          <VerArquivo file={{ url: c.file_url, path: c.file_path, name: c.file_name }} />
                        </>
                      ) : (
                        <span className="text-xs text-gray-300">Sem arquivo</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">
                    {c.comment ? <span className="line-clamp-1">{c.comment}</span> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(c)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors" title="Editar">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(c.id)} disabled={deletingId === c.id}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Remover">
                        {deletingId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal inserir/editar */}
      {modalOpen && (
        <Modal title={editingId ? 'Editar atestado' : 'Inserir atestado'} onClose={() => setModalOpen(false)}>
          <div className="px-5 py-4 space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Data do atestado *</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Arquivo do atestado (PDF/JPG/PNG, até {MAX_MB} MB)</label>
              {file ? (
                <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-300 rounded-lg px-2.5 py-1.5">
                  <FileText className="w-4 h-4 text-red-500 shrink-0" />
                  <a href={file.url} onClick={e => abrirArquivoAssinado(e, file)} target="_blank" rel="noreferrer" className="text-[12px] text-emerald-700 hover:underline truncate flex-1">{file.name}</a>
                  <VerArquivo file={file} />
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

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Observação (opcional)</label>
              <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2}
                placeholder="Ex: 3 dias de afastamento, CID..."
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>

            {error && <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</p>}
          </div>
          <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || uploading} className="gap-1.5">
              {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Salvando...</> : <><CheckCircle2 className="w-3.5 h-3.5" />{editingId ? 'Salvar' : 'Inserir'}</>}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
