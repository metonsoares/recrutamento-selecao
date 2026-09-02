'use client'
import { useState, useRef } from 'react'
import {
  Plus, Pencil, Trash2, Loader2, X, Upload, FileText, FileDown, Download,
  CheckCircle2, AlertCircle, Wallet, CalendarDays,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/helpers'
import { abrirArquivoAssinado } from '@/lib/abrir-arquivo'
import { VerArquivo } from '@/components/ver-arquivo'

interface FileRef { url: string; name: string; path: string }

export interface EmployeeFile {
  id: string
  kind: string
  reference: string | null
  file_url: string | null
  file_name: string | null
  file_path: string | null
  comprovante_file?: FileRef | null
  created_at: string
}

interface Props {
  candidateId: string
  kind: string                 // 'contracheque' | 'folha_ponto'
  title: string                // "Contracheques"
  referenceLabel: string       // "Competência (mês/ano)"
  insertLabel: string          // "Inserir arquivo"
  initialFiles: EmployeeFile[]
}

// Competência "MM/YYYY" (ou "YYYY-MM") → chave numérica AAAAMM para ordenar.
function competenceKey(ref: string | null): number {
  if (!ref) return -1
  const s = ref.trim()
  let m = s.match(/^(\d{1,2})[/\-.](\d{4})$/)   // MM/YYYY
  if (m) return parseInt(m[2], 10) * 100 + parseInt(m[1], 10)
  m = s.match(/^(\d{4})[/\-.](\d{1,2})$/)        // YYYY-MM
  if (m) return parseInt(m[1], 10) * 100 + parseInt(m[2], 10)
  return -1
}
// Mais recente → mais antigo (competência); empate desempata pela inserção.
function sortByCompetence(a: EmployeeFile, b: EmployeeFile): number {
  const ka = competenceKey(a.reference), kb = competenceKey(b.reference)
  if (kb !== ka) return kb - ka
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
}

export function EmployeeFilesTab({ candidateId, kind, title, referenceLabel, insertLabel, initialFiles }: Props) {
  const Icon = kind === 'folha_ponto' ? CalendarDays : Wallet
  const showComprovante = kind === 'contracheque'
  const [files, setFiles] = useState<EmployeeFile[]>(initialFiles)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [reference, setReference] = useState('')
  const [file, setFile] = useState<{ url: string; name: string; path: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function showToast(type: 'ok' | 'err', msg: string) { setToast({ type, msg }); setTimeout(() => setToast(null), 4000) }
  function openModal() { setEditingId(null); setReference(''); setFile(null); setError(''); setModalOpen(true) }

  function openEdit(f: EmployeeFile) {
    setEditingId(f.id)
    setReference(f.reference || '')
    setFile(f.file_url ? { url: f.file_url, name: f.file_name || 'Arquivo', path: f.file_path || '' } : null)
    setError('')
    setModalOpen(true)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setError('')
    if (f.size > 4 * 1024 * 1024) { setError('Arquivo excede 4 MB'); return }
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(f.type)) { setError('Use PDF, JPG ou PNG'); return }
    setUploading(true)
    const fd = new FormData(); fd.append('file', f); fd.append('docKey', kind)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/admission-docs`, { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setFile({ url: d.url, name: f.name, path: d.path })
    } catch (e) { setError((e as Error).message || 'Erro no upload') }
    finally { setUploading(false); if (e.target) e.target.value = '' }
  }

  async function handleSave() {
    if (!file) { setError('Anexe o arquivo.'); return }
    setSaving(true); setError('')
    try {
      const isEdit = editingId !== null
      const url = isEdit
        ? `/api/admin/candidatos/${candidateId}/employee-files/${editingId}`
        : `/api/admin/candidatos/${candidateId}/employee-files`
      const body = isEdit
        ? { reference, file_url: file.url, file_name: file.name, file_path: file.path || null }
        : { kind, reference, file_url: file.url, file_name: file.name, file_path: file.path }
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setFiles(prev => isEdit ? prev.map(f => f.id === editingId ? json.file : f) : [json.file, ...prev])
      setModalOpen(false)
      showToast('ok', isEdit ? 'Arquivo atualizado.' : 'Arquivo inserido.')
    } catch (e) { setError((e as Error).message || 'Erro ao salvar.') }
    finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este arquivo?')) return
    setDeletingId(id)
    const res = await fetch(`/api/admin/candidatos/${candidateId}/employee-files/${id}`, { method: 'DELETE' })
    const json = await res.json()
    setDeletingId(null)
    if (!res.ok) { showToast('err', json.error || 'Erro ao remover.'); return }
    setFiles(prev => prev.filter(f => f.id !== id))
    showToast('ok', 'Arquivo removido.')
  }

  // Comprovante de pagamento ao lado do contracheque
  async function saveComprovante(id: string, fileRef: FileRef | null) {
    const res = await fetch(`/api/admin/candidatos/${candidateId}/employee-files/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comprovante_file: fileRef }),
    })
    const json = await res.json()
    if (!res.ok) { showToast('err', json.error || 'Erro ao salvar comprovante.'); throw new Error(json.error) }
    setFiles(prev => prev.map(f => f.id === id ? { ...f, comprovante_file: fileRef } : f))
    showToast('ok', fileRef ? 'Comprovante salvo.' : 'Comprovante removido.')
  }

  return (
    <div className="max-w-3xl space-y-4">
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-[#333]" />
          <div>
            <h2 className="text-base font-bold text-gray-900">{title}</h2>
            <p className="text-[12px] text-muted-foreground">{files.length} arquivo{files.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <Button onClick={openModal} className="gap-1.5 shrink-0"><Plus className="w-4 h-4" />{insertLabel}</Button>
      </div>

      {files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3 bg-white rounded-2xl border">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center"><Icon className="w-7 h-7 text-gray-300" /></div>
          <p className="font-medium text-gray-600">Nenhum arquivo inserido</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs text-muted-foreground uppercase tracking-wide">
                <th className="px-4 py-3 text-left font-medium">{referenceLabel}</th>
                <th className="px-4 py-3 text-left font-medium">Arquivo</th>
                <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Inserido</th>
                {showComprovante && <th className="px-4 py-3 text-left font-medium">Comprovante de pagamento</th>}
                <th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[...files].sort(sortByCompetence).map(f => (
                <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-700">{f.reference || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {f.file_url ? (
                        <>
                          <a href={f.file_url ?? undefined} onClick={e => abrirArquivoAssinado(e, { url: f.file_url, path: f.file_path, name: f.file_name })}
                            target="_blank" rel="noreferrer" download
                            className="inline-flex items-center gap-1.5 text-emerald-700 hover:underline font-medium min-w-0">
                            {f.file_name?.endsWith('.pdf') ? <FileText className="w-4 h-4 text-red-500 shrink-0" /> : <FileDown className="w-4 h-4 text-blue-500 shrink-0" />}
                            <span className="truncate max-w-[200px]">{f.file_name || 'Arquivo'}</span>
                            <Download className="w-3.5 h-3.5 opacity-60" />
                          </a>
                          <VerArquivo file={{ url: f.file_url, path: f.file_path, name: f.file_name }} />
                        </>
                      ) : <span className="text-xs text-gray-300">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell text-xs">{formatDate(f.created_at)}</td>
                  {showComprovante && (
                    <td className="px-4 py-3">
                      <ComprovanteSlot candidateId={candidateId} value={f.comprovante_file ?? null}
                        onSaved={fr => saveComprovante(f.id, fr)} />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(f)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors" title="Editar">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(f.id)} disabled={deletingId === f.id}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Remover">
                        {deletingId === f.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="text-base font-semibold text-gray-900">{editingId ? 'Editar arquivo' : insertLabel}</h2>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">{referenceLabel}</label>
                <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Ex: 06/2026" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Arquivo * (PDF/JPG/PNG, até 4 MB)</label>
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
              {error && <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl">
              <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving || uploading} className="gap-1.5">
                {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Salvando...</> : <><CheckCircle2 className="w-3.5 h-3.5" />{editingId ? 'Salvar' : 'Inserir'}</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Slot do comprovante de pagamento (aba Contracheques) ─────────────────────

function ComprovanteSlot({ candidateId, value, onSaved }: {
  candidateId: string
  value: FileRef | null
  onSaved: (f: FileRef | null) => Promise<void>
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 4 * 1024 * 1024) { alert('Arquivo excede 4 MB'); if (e.target) e.target.value = ''; return }
    setBusy(true)
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('docKey', 'comprovante')
      const res = await fetch(`/api/admin/candidatos/${candidateId}/admission-docs`, { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      await onSaved({ url: d.url, name: file.name, path: d.path })
    } catch { /* toast tratado no onSaved */ }
    finally { setBusy(false); if (e.target) e.target.value = '' }
  }
  async function remove() { setBusy(true); try { await onSaved(null) } catch { /* */ } finally { setBusy(false) } }

  return (
    <div className="flex items-center gap-1.5">
      {value?.url ? (
        <div className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 rounded px-2 py-1 max-w-[180px]">
          <FileText className="w-3.5 h-3.5 text-red-500 shrink-0" />
          <a href={value.url} onClick={e => abrirArquivoAssinado(e, value)} target="_blank" rel="noreferrer" className="text-[11px] text-emerald-700 hover:underline truncate">{value.name}</a>
          <VerArquivo file={value} />
          <button onClick={remove} disabled={busy} className="text-gray-400 hover:text-red-500 shrink-0">
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
          </button>
        </div>
      ) : (
        <button onClick={() => ref.current?.click()} disabled={busy}
          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded border border-dashed border-gray-300 text-gray-500 hover:border-primary hover:text-primary transition-colors disabled:opacity-50">
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}Anexar
        </button>
      )}
      <input ref={ref} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={upload} />
    </div>
  )
}
