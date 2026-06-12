'use client'
import { useState, useRef } from 'react'
import {
  FileText, Plus, Trash2, Loader2, X, Upload, FileDown, Download,
  CheckCircle2, AlertCircle, FileSignature, Eye, Pencil, Braces,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/helpers'

export interface ContractTemplate {
  id: string
  name: string
  empresa: string | null
  file_url: string | null
  file_name: string | null
  file_path: string | null
  file_type: string | null
  created_at: string
}

interface Props { initialTemplates: ContractTemplate[]; companyOptions: string[] }

// ─── Mapeamento de variáveis ────────────────────────────────────────────────
// Campos do sistema disponíveis para associação
const SYSTEM_FIELDS: { value: string; label: string }[] = [
  { value: 'nome', label: 'Nome do candidato' },
  { value: 'cpf', label: 'CPF do candidato' },
  { value: 'telefone', label: 'Telefone do candidato' },
  { value: 'email', label: 'E-mail do candidato' },
  { value: 'cidade', label: 'Cidade do candidato' },
  { value: 'bairro', label: 'Bairro do candidato' },
  { value: 'cargo', label: 'Cargo / Função' },
  { value: 'salario', label: 'Salário / Valor cadastrado' },
  { value: 'empresa', label: 'Empresa (contratante)' },
  { value: 'empresa_cnpj', label: 'CNPJ da empresa' },
  { value: 'data', label: 'Data atual' },
]

const MANUAL_TYPES: { value: string; label: string }[] = [
  { value: 'text', label: 'Texto' },
  { value: 'number', label: 'Número' },
  { value: 'date', label: 'Data' },
  { value: 'currency', label: 'Moeda (R$)' },
]

interface MapRow { name: string; source: string; type: string }

/** Sugere a associação pelo nome da variável. */
function guessSource(name: string): string {
  const n = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
  const GUESS: Record<string, string> = {
    nome: 'nome', nomecompleto: 'nome', contratado: 'nome', contratada: 'nome', candidato: 'nome', funcionario: 'nome',
    cpf: 'cpf', telefone: 'telefone', celular: 'telefone', fone: 'telefone', email: 'email',
    cidade: 'cidade', bairro: 'bairro', cargo: 'cargo', funcao: 'cargo', vaga: 'cargo',
    salario: 'salario', empresa: 'empresa', contratante: 'empresa', cnpj: 'empresa_cnpj',
    data: 'data', datahoje: 'data', dataatual: 'data', hoje: 'data',
  }
  return GUESS[n] || 'manual'
}

export function TemplatesManager({ initialTemplates, companyOptions }: Props) {
  const [templates, setTemplates] = useState<ContractTemplate[]>(initialTemplates)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [existingFileName, setExistingFileName] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Mapeamento de variáveis ──
  const [mapOpen, setMapOpen] = useState(false)
  const [mapTemplate, setMapTemplate] = useState<{ id: string; name: string } | null>(null)
  const [mapRows, setMapRows] = useState<MapRow[]>([])
  const [loadingMap, setLoadingMap] = useState(false)
  const [savingMap, setSavingMap] = useState(false)
  const [mapError, setMapError] = useState('')

  function showToast(type: 'ok' | 'err', msg: string) { setToast({ type, msg }); setTimeout(() => setToast(null), 4000) }
  function openModal() { setEditingId(null); setExistingFileName(null); setName(''); setEmpresa(''); setFile(null); setError(''); setModalOpen(true) }

  async function openMapping(t: { id: string; name: string }) {
    setMapTemplate(t); setMapRows([]); setMapError(''); setMapOpen(true); setLoadingMap(true)
    try {
      const res = await fetch(`/api/admin/contract-templates/${t.id}/variables`)
      const d = await res.json()
      if (!res.ok) { setMapError(d.error || 'Erro ao ler o template.'); return }
      if (d.pdf) { setMapError('Templates em PDF não possuem variáveis para associar.'); return }
      const existing = (d.mappings || {}) as Record<string, { source: string; type?: string }>
      const rows: MapRow[] = (d.variables || []).map((name: string) => {
        const m = existing[name]
        if (m) return { name, source: m.source, type: m.type || 'text' }
        return { name, source: guessSource(name), type: 'text' }
      })
      if (rows.length === 0) setMapError('Nenhuma variável {campo} encontrada no documento. Use chaves simples no .docx, ex.: {nome}, {Valor do contrato}.')
      setMapRows(rows)
    } catch { setMapError('Erro ao ler o template.') }
    finally { setLoadingMap(false) }
  }

  async function saveMapping() {
    if (!mapTemplate) return
    setSavingMap(true); setMapError('')
    try {
      const mappings = mapRows.reduce((acc, r) => {
        acc[r.name] = r.source === 'manual' ? { source: 'manual', type: r.type } : { source: r.source }
        return acc
      }, {} as Record<string, { source: string; type?: string }>)
      const res = await fetch(`/api/admin/contract-templates/${mapTemplate.id}/variables`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mappings }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.ok) { setMapError(d.error || 'Erro ao salvar.'); return }
      setMapOpen(false)
      showToast('ok', 'Campos do template associados.')
    } finally { setSavingMap(false) }
  }
  function openEdit(t: ContractTemplate) {
    setEditingId(t.id); setExistingFileName(t.file_name || null)
    setName(t.name); setEmpresa(t.empresa || ''); setFile(null); setError(''); setModalOpen(true)
  }

  /** URL de visualização mantendo a formatação original (.docx via visualizador do Office). */
  function viewUrl(t: ContractTemplate): string {
    const url = t.file_url || ''
    if (t.file_type === 'pdf') return url
    return `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(url)}`
  }

  async function handleSave() {
    setError('')
    if (!name.trim()) { setError('Informe o nome do template.'); return }
    if (!editingId && !file) { setError('Selecione um arquivo (.docx ou .pdf).'); return }
    if (file && file.size > 15 * 1024 * 1024) { setError('Arquivo excede 15 MB.'); return }
    setSaving(true)
    const fd = new FormData()
    if (file) fd.append('file', file)
    fd.append('name', name); fd.append('empresa', empresa)
    try {
      const res = await fetch(editingId ? `/api/admin/contract-templates/${editingId}` : '/api/admin/contract-templates',
        { method: editingId ? 'PUT' : 'POST', body: fd })
      const d = await res.json(); if (!res.ok) throw new Error(d.error)
      if (editingId) {
        setTemplates(prev => prev.map(t => t.id === editingId ? d.template : t))
        showToast('ok', 'Template atualizado.')
      } else {
        setTemplates(prev => [d.template, ...prev])
        showToast('ok', 'Template adicionado.')
      }
      setModalOpen(false)
      // .docx → abre a tela de associação de variáveis
      if (d.template?.file_type !== 'pdf') openMapping({ id: d.template.id, name: d.template.name })
    } catch (e) { setError((e as Error).message || 'Erro ao salvar.') }
    finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este template de contrato?')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/admin/contract-templates/${id}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { showToast('err', d.error || 'Erro ao remover.'); return }
      setTemplates(prev => prev.filter(t => t.id !== id))
      showToast('ok', 'Template removido.')
    } finally { setDeletingId(null) }
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}{toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <FileSignature className="w-6 h-6 text-[#333]" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Templates de contrato</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{templates.length} template{templates.length !== 1 ? 's' : ''} · modelos para uso posterior</p>
          </div>
        </div>
        <Button onClick={openModal} className="gap-1.5 shrink-0"><Plus className="w-4 h-4" />Adicionar template</Button>
      </div>

      {templates.length === 0 ? (
        <div className="bg-white rounded-2xl border shadow-sm py-12 text-center text-sm text-muted-foreground">
          <FileSignature className="w-8 h-8 text-gray-200 mx-auto mb-2" />
          Nenhum template cadastrado. Adicione contratos modelo em .docx ou .pdf.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden divide-y">
          {templates.map(t => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                {t.file_type === 'pdf' ? <FileText className="w-4 h-4 text-red-500" /> : <FileDown className="w-4 h-4 text-blue-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{t.name}</p>
                <p className="text-[12px] text-muted-foreground truncate">
                  {t.empresa ? `${t.empresa} · ` : ''}{(t.file_type || '').toUpperCase()} · {formatDate(t.created_at)}
                </p>
              </div>
              {t.file_url && (
                <a href={viewUrl(t)} target="_blank" rel="noreferrer"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5" title="Visualizar (formatação original)"><Eye className="w-4 h-4" /></a>
              )}
              {t.file_type !== 'pdf' && (
                <button onClick={() => openMapping({ id: t.id, name: t.name })}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5" title="Associar campos (variáveis)"><Braces className="w-4 h-4" /></button>
              )}
              <button onClick={() => openEdit(t)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5" title="Editar"><Pencil className="w-4 h-4" /></button>
              {t.file_url && (
                <a href={t.file_url} target="_blank" rel="noreferrer" download
                  className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5" title="Baixar"><Download className="w-4 h-4" /></a>
              )}
              <button onClick={() => handleDelete(t.id)} disabled={deletingId === t.id}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50" title="Remover">
                {deletingId === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="text-base font-semibold text-gray-900">{editingId ? 'Editar template de contrato' : 'Adicionar template de contrato'}</h2>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Nome do template *</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Contrato de experiência - Garçom" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Empresa (opcional)</label>
                <select value={empresa} onChange={e => setEmpresa(e.target.value)}
                  className="h-9 w-full border border-gray-300 rounded-md px-3 text-sm bg-white">
                  <option value="">Todas / não especificar</option>
                  {companyOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">
                  Arquivo {editingId ? '(opcional — deixe em branco para manter o atual)' : '*'} (.docx ou .pdf — até 15 MB)
                </label>
                {file ? (
                  <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-300 rounded-lg px-2.5 py-1.5">
                    <FileText className="w-4 h-4 text-red-500 shrink-0" />
                    <span className="text-[12px] text-emerald-700 truncate flex-1">{file.name}</span>
                    <button onClick={() => setFile(null)} className="text-gray-400 hover:text-red-500 shrink-0"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <>
                    {editingId && existingFileName && (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mb-1">
                        <FileText className="w-3.5 h-3.5 text-gray-400" />Atual: {existingFileName}
                      </p>
                    )}
                    <button onClick={() => fileRef.current?.click()}
                      className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-primary hover:text-primary transition-colors w-full justify-center">
                      <Upload className="w-3.5 h-3.5" />{editingId ? 'Substituir arquivo' : 'Selecionar arquivo'}
                    </button>
                  </>
                )}
                <input ref={fileRef} type="file" accept="application/pdf,.pdf,.doc,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                  className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
              </div>
              {error && <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl">
              <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Salvando...</> : editingId ? <><CheckCircle2 className="w-3.5 h-3.5" />Salvar alterações</> : <><Plus className="w-3.5 h-3.5" />Adicionar</>}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: associação de variáveis */}
      {mapOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-base font-semibold text-gray-900 flex items-center gap-1.5"><Braces className="w-4 h-4 text-primary" />Associar campos do template</h2>
                <p className="text-[12px] text-muted-foreground truncate">{mapTemplate?.name}</p>
              </div>
              <button onClick={() => setMapOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {loadingMap && (
                <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" /><span className="text-sm">Lendo variáveis do documento...</span>
                </div>
              )}

              {!loadingMap && mapRows.length > 0 && (
                <>
                  <p className="text-[12px] text-muted-foreground bg-gray-50 border rounded-lg px-3 py-2">
                    Associe cada variável encontrada no documento a um campo do sistema, ou marque como <strong>&ldquo;Preencher na hora&rdquo;</strong> para digitar o valor ao gerar o contrato.
                  </p>
                  <div className="space-y-2">
                    {mapRows.map((r, i) => (
                      <div key={r.name} className="flex items-center gap-2 rounded-lg border p-2.5 bg-gray-50/50 flex-wrap">
                        <span className="font-mono text-[12px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-md shrink-0">{'{'}{r.name}{'}'}</span>
                        <span className="text-gray-400 shrink-0">→</span>
                        <select value={r.source}
                          onChange={e => setMapRows(prev => prev.map((x, j) => j === i ? { ...x, source: e.target.value } : x))}
                          className="h-8 flex-1 min-w-[180px] border border-gray-300 rounded-md px-2 text-sm bg-white">
                          {SYSTEM_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                          <option value="manual">✏️ Preencher na hora</option>
                        </select>
                        {r.source === 'manual' && (
                          <select value={r.type}
                            onChange={e => setMapRows(prev => prev.map((x, j) => j === i ? { ...x, type: e.target.value } : x))}
                            className="h-8 w-[110px] border border-gray-300 rounded-md px-2 text-xs bg-white shrink-0">
                            {MANUAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {mapError && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{mapError}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl sticky bottom-0">
              <Button variant="outline" onClick={() => setMapOpen(false)} disabled={savingMap}>Fechar</Button>
              {mapRows.length > 0 && (
                <Button onClick={saveMapping} disabled={savingMap} className="gap-1.5">
                  {savingMap ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Salvando...</> : <><CheckCircle2 className="w-3.5 h-3.5" />Confirmar associações</>}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
