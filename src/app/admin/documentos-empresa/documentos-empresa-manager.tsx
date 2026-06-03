'use client'
import { useState, useRef } from 'react'
import {
  FolderArchive, Plus, Trash2, Loader2, X, Upload, FileText, FileDown,
  CheckCircle2, AlertCircle, Download, Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/helpers'

interface CompanyFile {
  id: string
  name: string
  category: string | null
  file_url: string | null
  file_name: string | null
  file_path: string | null
  created_at: string
}

interface Props { files: CompanyFile[] }

export function DocumentosEmpresaManager({ files: initial }: Props) {
  const [files, setFiles] = useState<CompanyFile[]>(initial)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // form
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function showToast(type: 'ok' | 'err', msg: string) { setToast({ type, msg }); setTimeout(() => setToast(null), 4000) }

  function openModal() { setName(''); setCategory(''); setFile(null); setError(''); setModalOpen(true) }

  async function handleSave() {
    setError('')
    if (!name.trim()) { setError('Informe o nome do documento.'); return }
    if (!file) { setError('Anexe um arquivo.'); return }
    if (file.size > 10 * 1024 * 1024) { setError('Arquivo excede 10 MB.'); return }
    setSaving(true)
    const fd = new FormData()
    fd.append('file', file); fd.append('name', name); fd.append('category', category)
    try {
      const res = await fetch('/api/admin/company-files', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setFiles(prev => [data.file, ...prev])
      setModalOpen(false)
      showToast('ok', 'Documento adicionado.')
    } catch (e) {
      setError((e as Error).message || 'Erro ao salvar.')
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este documento?')) return
    setDeletingId(id)
    const res = await fetch(`/api/admin/company-files/${id}`, { method: 'DELETE' })
    const data = await res.json()
    setDeletingId(null)
    if (!res.ok) { showToast('err', data.error || 'Erro ao remover.'); return }
    setFiles(prev => prev.filter(f => f.id !== id))
    showToast('ok', 'Documento removido.')
  }

  const filtered = files.filter(f =>
    !search.trim() ||
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    (f.category || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <FolderArchive className="w-6 h-6 text-[#333]" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Documentos da Empresa</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{files.length} documento{files.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <Button onClick={openModal} className="gap-1.5 shrink-0">
          <Plus className="w-4 h-4" />Adicionar documento
        </Button>
      </div>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar documento..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-xs text-muted-foreground uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-medium">Documento</th>
              <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Categoria</th>
              <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Adicionado</th>
              <th className="px-4 py-3 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(f => (
              <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  {f.file_url ? (
                    <a href={f.file_url} target="_blank" rel="noreferrer" download
                      className="inline-flex items-center gap-1.5 text-emerald-700 hover:underline font-medium">
                      {f.file_name?.endsWith('.pdf') ? <FileText className="w-4 h-4 text-red-500 shrink-0" /> : <FileDown className="w-4 h-4 text-blue-500 shrink-0" />}
                      {f.name}
                      <Download className="w-3.5 h-3.5 opacity-60" />
                    </a>
                  ) : <span className="text-gray-700">{f.name}</span>}
                </td>
                <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{f.category || '—'}</td>
                <td className="px-4 py-3 text-gray-500 hidden md:table-cell text-xs">{formatDate(f.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleDelete(f.id)} disabled={deletingId === f.id}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Remover">
                    {deletingId === f.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">
                <FolderArchive className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                Nenhum documento cadastrado.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="text-base font-semibold text-gray-900">Adicionar documento</h2>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Nome do documento *</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Modelo de Contrato de Trabalho" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Categoria (opcional)</label>
                <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="Ex: Contratos, Políticas, Modelos" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Arquivo * (PDF, DOC, JPG, PNG — até 10 MB)</label>
                {file ? (
                  <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-300 rounded-lg px-2.5 py-1.5">
                    <FileText className="w-4 h-4 text-red-500 shrink-0" />
                    <span className="text-[12px] text-emerald-700 truncate flex-1">{file.name}</span>
                    <button onClick={() => setFile(null)} className="text-gray-400 hover:text-red-500 shrink-0"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <button onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-primary hover:text-primary transition-colors w-full justify-center">
                    <Upload className="w-3.5 h-3.5" />Selecionar arquivo
                  </button>
                )}
                <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,.doc,.docx" className="hidden"
                  onChange={e => setFile(e.target.files?.[0] || null)} />
              </div>
              {error && <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl">
              <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Salvando...</> : <><Plus className="w-3.5 h-3.5" />Adicionar</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
