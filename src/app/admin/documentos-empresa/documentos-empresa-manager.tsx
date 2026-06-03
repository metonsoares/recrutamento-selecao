'use client'
import { useState, useRef, useMemo } from 'react'
import {
  FolderArchive, Plus, Trash2, Loader2, X, Upload, FileText, FileDown,
  CheckCircle2, AlertCircle, Download, Search, Building2, ChevronDown, Clock, ShieldAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/helpers'

interface CompanyFile {
  id: string
  name: string
  category: string | null
  empresa: string | null
  expires_at: string | null
  no_expiry: boolean
  file_url: string | null
  file_name: string | null
  file_path: string | null
  created_at: string
}

interface Props { files: CompanyFile[]; companyOptions: string[] }

const TIPOS = ['Contratos', 'Políticas', 'Modelos', 'Treinamentos', 'Circulares', 'Fiscais', 'Outros']

// Validade → { label, tone }
function validityInfo(f: CompanyFile): { label: string; tone: 'ok' | 'warn' | 'danger' | 'none' } {
  if (f.no_expiry) return { label: 'Não expira', tone: 'none' }
  if (!f.expires_at) return { label: '—', tone: 'none' }
  const exp = new Date(f.expires_at + 'T00:00:00')
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const days = Math.round((exp.getTime() - now.getTime()) / 86400000)
  if (days < 0) return { label: `Vencido em ${formatDate(f.expires_at)}`, tone: 'danger' }
  if (days <= 30) return { label: `Vence ${formatDate(f.expires_at)}`, tone: 'warn' }
  return { label: `Válido até ${formatDate(f.expires_at)}`, tone: 'ok' }
}

export function DocumentosEmpresaManager({ files: initial, companyOptions }: Props) {
  const [files, setFiles] = useState<CompanyFile[]>(initial)
  const [search, setSearch] = useState('')
  const [empresaFilter, setEmpresaFilter] = useState('all')
  const [tipoFilter, setTipoFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // form
  const [name, setName] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [category, setCategory] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [noExpiry, setNoExpiry] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function showToast(type: 'ok' | 'err', msg: string) { setToast({ type, msg }); setTimeout(() => setToast(null), 4000) }

  function openModal() { setName(''); setEmpresa(''); setCategory(''); setExpiresAt(''); setNoExpiry(false); setFile(null); setError(''); setModalOpen(true) }

  function toggleGroup(key: string) {
    setCollapsed(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n })
  }

  async function handleSave() {
    setError('')
    if (!empresa) { setError('Selecione a empresa.'); return }
    if (!name.trim()) { setError('Informe o nome do documento.'); return }
    if (!noExpiry && !expiresAt) { setError('Informe a validade ou marque "Não expira".'); return }
    if (!file) { setError('Anexe um arquivo.'); return }
    if (file.size > 10 * 1024 * 1024) { setError('Arquivo excede 10 MB.'); return }
    setSaving(true)
    const fd = new FormData()
    fd.append('file', file); fd.append('name', name); fd.append('category', category); fd.append('empresa', empresa)
    fd.append('no_expiry', String(noExpiry)); fd.append('expires_at', expiresAt)
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

  // Filtra
  const filtered = useMemo(() => files
    .filter(f => empresaFilter === 'all' || f.empresa === empresaFilter)
    .filter(f => tipoFilter === 'all' || f.category === tipoFilter)
    .filter(f =>
      !search.trim() ||
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      (f.category || '').toLowerCase().includes(search.toLowerCase()) ||
      (f.empresa || '').toLowerCase().includes(search.toLowerCase())
    ), [files, empresaFilter, tipoFilter, search])

  // Agrupa por empresa → por tipo
  const grouped = useMemo(() => {
    const byCompany: Record<string, Record<string, CompanyFile[]>> = {}
    for (const f of filtered) {
      const emp = f.empresa || 'Sem empresa'
      const tipo = f.category || 'Sem tipo'
      byCompany[emp] = byCompany[emp] || {}
      byCompany[emp][tipo] = byCompany[emp][tipo] || []
      byCompany[emp][tipo].push(f)
    }
    return byCompany
  }, [filtered])

  const companyNames = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  const toneClass = {
    ok: 'bg-emerald-100 text-emerald-700',
    warn: 'bg-amber-100 text-amber-700',
    danger: 'bg-red-100 text-red-700',
    none: 'bg-gray-100 text-gray-500',
  }

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

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar documento..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={empresaFilter} onChange={e => setEmpresaFilter(e.target.value)}
          className="h-9 border border-gray-300 rounded-md px-3 text-sm bg-white min-w-[180px]">
          <option value="all">Todas as empresas</option>
          {companyOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={tipoFilter} onChange={e => setTipoFilter(e.target.value)}
          className="h-9 border border-gray-300 rounded-md px-3 text-sm bg-white min-w-[160px]">
          <option value="all">Todos os tipos</option>
          {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Quadros por empresa */}
      {companyNames.length === 0 && (
        <div className="bg-white rounded-2xl border shadow-sm py-12 text-center text-sm text-muted-foreground">
          <FolderArchive className="w-8 h-8 text-gray-200 mx-auto mb-2" />
          Nenhum documento cadastrado.
        </div>
      )}

      {companyNames.map(emp => {
        const tipos = grouped[emp]
        const tipoNames = Object.keys(tipos).sort((a, b) => a.localeCompare(b, 'pt-BR'))
        const total = tipoNames.reduce((s, t) => s + tipos[t].length, 0)
        return (
          <div key={emp} className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            {/* Cabeçalho da empresa */}
            <div className="flex items-center gap-2 px-5 py-3 border-b bg-gray-50">
              <Building2 className="w-5 h-5 text-[#333]" />
              <h2 className="text-sm font-bold text-gray-900 flex-1">{emp}</h2>
              <span className="text-[11px] font-semibold text-muted-foreground bg-white border px-2 py-0.5 rounded-full">{total}</span>
            </div>

            {/* Grupos por tipo */}
            <div className="divide-y">
              {tipoNames.map(tipo => {
                const key = `${emp}::${tipo}`
                const isCollapsed = collapsed.has(key)
                const docs = tipos[tipo]
                return (
                  <div key={key}>
                    <button onClick={() => toggleGroup(key)}
                      className="w-full flex items-center gap-2 px-5 py-2.5 hover:bg-gray-50 transition-colors">
                      <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                      <span className="text-[13px] font-semibold text-gray-700">{tipo}</span>
                      <span className="text-[11px] text-muted-foreground">({docs.length})</span>
                    </button>
                    {!isCollapsed && (
                      <div className="divide-y divide-gray-100">
                        {docs.map(f => {
                          const v = validityInfo(f)
                          return (
                            <div key={f.id} className="flex items-center gap-3 px-5 py-2.5 pl-11 hover:bg-gray-50 transition-colors">
                              <div className="flex-1 min-w-0">
                                {f.file_url ? (
                                  <a href={f.file_url} target="_blank" rel="noreferrer" download
                                    className="inline-flex items-center gap-1.5 text-emerald-700 hover:underline font-medium text-sm">
                                    {f.file_name?.endsWith('.pdf') ? <FileText className="w-4 h-4 text-red-500 shrink-0" /> : <FileDown className="w-4 h-4 text-blue-500 shrink-0" />}
                                    {f.name}
                                    <Download className="w-3.5 h-3.5 opacity-60" />
                                  </a>
                                ) : <span className="text-sm text-gray-700">{f.name}</span>}
                              </div>
                              <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${toneClass[v.tone]}`}>
                                {v.tone === 'danger' ? <ShieldAlert className="w-3 h-3" /> : v.tone === 'none' ? null : <Clock className="w-3 h-3" />}
                                {v.label}
                              </span>
                              <button onClick={() => handleDelete(f.id)} disabled={deletingId === f.id}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0" title="Remover">
                                {deletingId === f.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
              <h2 className="text-base font-semibold text-gray-900">Adicionar documento</h2>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Empresa *</label>
                <select value={empresa} onChange={e => setEmpresa(e.target.value)}
                  className="h-9 w-full border border-gray-300 rounded-md px-3 text-sm bg-white">
                  <option value="">Selecionar empresa...</option>
                  {companyOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Nome do documento *</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Cartão CNPJ" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Tipo de documento</label>
                <select value={category} onChange={e => setCategory(e.target.value)}
                  className="h-9 w-full border border-gray-300 rounded-md px-3 text-sm bg-white">
                  <option value="">Selecionar tipo...</option>
                  {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Validade */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">Validade</label>
                <Input type="date" value={expiresAt} disabled={noExpiry}
                  onChange={e => setExpiresAt(e.target.value)} className="disabled:opacity-50" />
                <label className="flex items-center gap-2 cursor-pointer text-sm pt-0.5">
                  <input type="checkbox" checked={noExpiry} onChange={e => { setNoExpiry(e.target.checked); if (e.target.checked) setExpiresAt('') }} className="accent-primary" />
                  Não expira
                </label>
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
            <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl sticky bottom-0">
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
