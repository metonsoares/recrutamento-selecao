'use client'
import { useState, useRef, useEffect } from 'react'
import {
  Upload, X, FileText, CheckCircle2, AlertCircle, Clock,
  Loader2, Save, Plus, Trash2, GraduationCap, Megaphone, Building2, Receipt, LogOut,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface UploadedFile { url: string; name: string; path: string }

interface DocState {
  not_applicable: boolean
  files: UploadedFile[]
}

interface CustomDoc {
  id: string
  name: string
  files: UploadedFile[]
}

// ─── Lista de documentos da empresa ──────────────────────────────────────────

const COMPANY_DOCS = [
  { key: 'ficha_registro',      label: 'Ficha de registro',                              multiple: false, na: false },
  { key: 'contrato_tempo_determinado', label: 'Contrato de prestação de serviço',        multiple: true,  na: true  },
  { key: 'contrato_experiencia',label: 'Contrato de experiência',                        multiple: false, na: false },
  { key: 'contrato_trabalho',   label: 'Contrato de trabalho corporativo',               multiple: false, na: false },
  { key: 'regulamento_interno', label: 'Regulamento interno',                            multiple: false, na: false },
  { key: 'banco_horas',         label: 'Acordo individual de banco de horas',            multiple: false, na: true  },
  { key: 'cessao_imagem',       label: 'Termo de cessão de imagem',                      multiple: false, na: false },
  { key: 'vale_transporte',     label: 'Termo declaração vale transporte',               multiple: true,  na: true  },
  { key: 'uniformes_epis',      label: 'Termo entrega de uniformes/EPIs',                multiple: true,  na: false },
  { key: 'acrm_geral',          label: 'Termo entrega geral',                           multiple: true,  na: false },
  { key: 'acrm_escala',         label: 'Acordo individual de escala 12×36',             multiple: false, na: true  },
  { key: 'premio_caju',         label: 'Prêmio Caju',                                    multiple: true,  na: true  },
]

function emptyDoc(): DocState { return { not_applicable: false, files: [] } }

function initDocs(saved: Record<string, unknown> | null): Record<string, DocState> {
  const result: Record<string, DocState> = {}
  for (const d of COMPANY_DOCS) {
    const s = saved?.[d.key]
    if (!s) { result[d.key] = emptyDoc(); continue }
    if (typeof s === 'object' && s !== null && 'files' in s) {
      result[d.key] = {
        not_applicable: (s as DocState).not_applicable ?? false,
        files: (s as DocState).files ?? [],
      }
    } else {
      result[d.key] = emptyDoc()
    }
  }
  return result
}

// ─── Linha de documento ───────────────────────────────────────────────────────

function DocRow({
  doc, state, onChange, candidateId,
}: {
  doc: typeof COMPANY_DOCS[number]
  state: DocState
  onChange: (s: DocState) => void
  candidateId: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const isNA = state.not_applicable
  const files = state.files ?? []
  const isDone = isNA || files.length > 0

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError('')
    if (file.size > 15 * 1024 * 1024) { setUploadError('Arquivo excede 15 MB'); return }
    if (!['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'].includes(file.type)) {
      setUploadError('Use PDF, JPG, PNG, Word ou Excel'); return
    }
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('docKey', `company-${doc.key}`)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/admission-docs`, {
        method: 'POST', body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const incoming = { url: data.url, name: file.name, path: data.path }
      const newFiles = doc.multiple ? [...files, incoming].slice(0, 4) : [incoming]
      onChange({ ...state, files: newFiles })
    } catch (err) {
      setUploadError((err as Error).message || 'Erro no upload')
    } finally {
      setUploading(false)
      if (e.target) e.target.value = ''
    }
  }

  async function handleRemove(idx: number) {
    if (!confirm('Remover este arquivo?')) return
    const f = files[idx]
    if (f?.path) {
      await fetch(`/api/admin/candidatos/${candidateId}/admission-docs`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: f.path }),
      }).catch(() => {})
    }
    const newFiles = [...files]; newFiles.splice(idx, 1)
    onChange({ ...state, files: newFiles })
  }

  return (
    <div className={`rounded-xl border p-3 transition-all ${
      isNA       ? 'bg-gray-50 border-gray-200' :
      isDone     ? 'bg-emerald-50 border-emerald-200' :
                   'bg-amber-50/60 border-amber-200'
    }`}>
      {/* Header */}
      <div className="flex items-start gap-2 flex-wrap">
        {/* Badge */}
        <span className={`shrink-0 mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
          isNA   ? 'bg-gray-200 text-gray-500' :
          isDone ? 'bg-emerald-100 text-emerald-700' :
                   'bg-amber-100 text-amber-700'
        }`}>
          {isNA ? 'N/A' : isDone
            ? <><CheckCircle2 className="w-2.5 h-2.5" />Enviado</>
            : <><Clock className="w-2.5 h-2.5" />Pendente</>}
        </span>

        {/* Label */}
        <span className={`flex-1 text-sm font-medium leading-snug ${isNA ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
          {doc.label}
          {doc.multiple && <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">(até 4 arquivos)</span>}
        </span>

        {/* N/A */}
        {doc.na && (
          <label className="flex items-center gap-1 text-[11px] text-gray-500 cursor-pointer shrink-0">
            <input type="checkbox" checked={isNA} onChange={e => onChange({ ...state, not_applicable: e.target.checked })} className="accent-gray-400" />
            Não aplicável
          </label>
        )}
      </div>

      {/* Uploads */}
      {!isNA && (
        <div className="mt-2 space-y-1.5">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-white border border-emerald-300 rounded-lg px-2.5 py-1">
              <FileText className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <a href={f.url} target="_blank" rel="noreferrer"
                className="text-[11px] text-emerald-700 hover:underline truncate max-w-[240px]">
                {f.name}
              </a>
              <button onClick={() => handleRemove(i)} className="ml-auto text-gray-400 hover:text-red-500 shrink-0">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}

          {/* Upload button — múltiplos até 4; single só quando sem arquivo */}
          {((doc.multiple && files.length < 4) || files.length === 0) && (
            <button
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
            >
              {uploading
                ? <><Loader2 className="w-3 h-3 animate-spin" />Enviando...</>
                : <><Upload className="w-3 h-3" />Anexar arquivo</>}
            </button>
          )}
          <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,.doc,.docx,.xls,.xlsx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={handleFile} />
          {uploadError && <p className="text-[11px] text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{uploadError}</p>}
        </div>
      )}
    </div>
  )
}

// ─── Card de documentos livres (Treinamentos / Circulares) ────────────────────

function CustomDocRow({ item, onChange, onRemove, candidateId }: {
  item: CustomDoc
  onChange: (i: CustomDoc) => void
  onRemove: () => void
  candidateId: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const hasFile = item.files.length > 0

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErr('')
    if (file.size > 15 * 1024 * 1024) { setErr('Arquivo excede 15 MB'); return }
    if (!['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'].includes(file.type)) { setErr('Use PDF, JPG, PNG, Word ou Excel'); return }
    setUploading(true)
    const fd = new FormData(); fd.append('file', file); fd.append('docKey', 'custom')
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/admission-docs`, { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      onChange({ ...item, files: [...item.files, { url: d.url, name: file.name, path: d.path }] })
    } catch (e) { setErr((e as Error).message || 'Erro no upload') }
    finally { setUploading(false); if (e.target) e.target.value = '' }
  }

  async function deleteFromStorage(path?: string) {
    if (!path) return
    await fetch(`/api/admin/candidatos/${candidateId}/admission-docs`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }),
    }).catch(() => {})
  }

  function removeFile(idx: number) {
    if (!confirm('Remover este arquivo?')) return
    const f = item.files[idx]
    deleteFromStorage(f?.path)
    const files = [...item.files]; files.splice(idx, 1)
    onChange({ ...item, files })
  }

  async function handleRemoveItem() {
    if (!confirm('Remover este documento e o(s) arquivo(s) anexado(s)?')) return
    // remove todos os arquivos do storage antes de excluir o item
    await Promise.all(item.files.map(f => deleteFromStorage(f.path)))
    onRemove()
  }

  return (
    <div className={`rounded-xl border p-3 ${hasFile ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50/60 border-amber-200'}`}>
      <div className="flex items-center gap-2">
        <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${hasFile ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          {hasFile ? <><CheckCircle2 className="w-2.5 h-2.5" />Enviado</> : <><Clock className="w-2.5 h-2.5" />Pendente</>}
        </span>
        <Input value={item.name} onChange={e => onChange({ ...item, name: e.target.value })}
          placeholder="Nome do documento" className="h-8 text-sm flex-1" />
        <button onClick={handleRemoveItem} className="text-gray-400 hover:text-red-500 shrink-0"><Trash2 className="w-4 h-4" /></button>
      </div>
      <div className="mt-2 space-y-1.5">
        {item.files.map((f, i) => (
          <div key={i} className="flex items-center gap-1.5 bg-white border border-emerald-300 rounded-lg px-2.5 py-1">
            <FileText className="w-3.5 h-3.5 text-red-500 shrink-0" />
            <a href={f.url} target="_blank" rel="noreferrer" className="text-[11px] text-emerald-700 hover:underline truncate max-w-[240px]">{f.name}</a>
            <button onClick={() => removeFile(i)} className="ml-auto text-gray-400 hover:text-red-500 shrink-0"><X className="w-3 h-3" /></button>
          </div>
        ))}
        <button disabled={uploading} onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-primary hover:text-primary transition-colors disabled:opacity-50">
          {uploading ? <><Loader2 className="w-3 h-3 animate-spin" />Enviando...</> : <><Upload className="w-3 h-3" />Anexar arquivo</>}
        </button>
        <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,.doc,.docx,.xls,.xlsx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={handleFile} />
        {err && <p className="text-[11px] text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{err}</p>}
      </div>
    </div>
  )
}

function CustomDocsCard({ title, subtitle, icon: Icon, items, setItems, candidateId, addLabel, pinnedFile, pinnedLabel }: {
  title: string
  subtitle: string
  icon: React.ElementType
  items: CustomDoc[]
  setItems: (fn: (prev: CustomDoc[]) => CustomDoc[]) => void
  candidateId: string
  addLabel: string
  pinnedFile?: UploadedFile | null
  pinnedLabel?: string
}) {
  function add() {
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now())
    setItems(prev => [...prev, { id, name: '', files: [] }])
  }
  const done = items.filter(i => i.files.length > 0).length

  return (
    <div className="bg-white rounded-2xl border shadow-sm p-5">
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-[#333]" />
          <div>
            <h2 className="text-base font-bold text-gray-900">{title}</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
        </div>
        {items.length > 0 && (
          <span className={`text-[12px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${done === items.length ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            {done}/{items.length}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {/* Documento fixado (ex: carta de demissão) */}
        {pinnedFile && (
          <div className="rounded-xl border bg-emerald-50 border-emerald-200 p-3">
            <p className="text-[13px] font-medium text-gray-800 mb-1.5">{pinnedLabel || 'Documento'}</p>
            <div className="flex items-center gap-1.5 bg-white border border-emerald-300 rounded-lg px-2.5 py-1">
              <FileText className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <a href={pinnedFile.url} target="_blank" rel="noreferrer" download className="text-[11px] text-emerald-700 hover:underline truncate max-w-[260px]">{pinnedFile.name}</a>
            </div>
          </div>
        )}
        {items.map(item => (
          <CustomDocRow
            key={item.id}
            item={item}
            candidateId={candidateId}
            onChange={u => setItems(prev => prev.map(p => p.id === item.id ? u : p))}
            onRemove={() => setItems(prev => prev.filter(p => p.id !== item.id))}
          />
        ))}
        {items.length === 0 && !pinnedFile && (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum item adicionado.</p>
        )}
        <button onClick={add}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border border-dashed border-gray-300 text-gray-600 hover:border-primary hover:text-primary transition-colors w-full justify-center mt-1">
          <Plus className="w-4 h-4" />{addLabel}
        </button>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props {
  candidateId: string
  initialDocs: Record<string, unknown> | null
  showDesligamento?: boolean
  terminationLetter?: UploadedFile | null
}

function initCustom(saved: Record<string, unknown> | null, key: string): CustomDoc[] {
  const arr = saved?.[key]
  if (Array.isArray(arr)) {
    return arr.map(i => ({ id: i.id || String(Math.random()), name: i.name || '', files: i.files || [] }))
  }
  return []
}

export function DocumentosTab({ candidateId, initialDocs, showDesligamento = false, terminationLetter = null }: Props) {
  const [docs, setDocs] = useState<Record<string, DocState>>(() => initDocs(initialDocs))
  const [treinamentos, setTreinamentos] = useState<CustomDoc[]>(() => initCustom(initialDocs, '__treinamentos'))
  const [circulares, setCirculares] = useState<CustomDoc[]>(() => initCustom(initialDocs, '__circulares'))
  const [recibos, setRecibos] = useState<CustomDoc[]>(() => initCustom(initialDocs, '__recibos'))
  const [desligamentoDocs, setDesligamentoDocs] = useState<CustomDoc[]>(() => initCustom(initialDocs, '__desligamento'))
  const [saving, setSaving] = useState(false)
  const [autoStatus, setAutoStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  function setDoc(key: string, val: DocState) {
    setDocs(prev => ({ ...prev, [key]: val }))
  }

  async function persist(): Promise<boolean> {
    const payload = { ...docs, __treinamentos: treinamentos, __circulares: circulares, __recibos: recibos, __desligamento: desligamentoDocs }
    const res = await fetch(`/api/admin/candidatos/${candidateId}/company-docs`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Erro ao salvar.')
    return true
  }

  async function handleSave() {
    setSaving(true)
    try {
      await persist()
      setToast({ type: 'ok', msg: 'Documentos salvos!' })
    } catch (e) {
      setToast({ type: 'err', msg: (e as Error).message || 'Erro ao salvar.' })
    } finally {
      setSaving(false)
      setTimeout(() => setToast(null), 4000)
    }
  }

  // ── Auto-save (ao anexar/remover/alterar) ─────────────────────────────────
  const firstRender = useRef(true)
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    if (autoTimer.current) clearTimeout(autoTimer.current)
    autoTimer.current = setTimeout(async () => {
      setAutoStatus('saving')
      try {
        await persist()
        setAutoStatus('saved')
        setTimeout(() => setAutoStatus('idle'), 2500)
      } catch {
        setAutoStatus('idle')
        setToast({ type: 'err', msg: 'Falha ao salvar automaticamente. Use o botão Salvar.' })
        setTimeout(() => setToast(null), 4000)
      }
    }, 700)
    return () => { if (autoTimer.current) clearTimeout(autoTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, treinamentos, circulares, recibos, desligamentoDocs])

  const done = COMPANY_DOCS.filter(d => {
    const s = docs[d.key]
    return s?.not_applicable || (s?.files?.length ?? 0) > 0
  }).length
  const total = COMPANY_DOCS.length

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
      <div className="bg-white rounded-2xl border shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">Documentos da Empresa</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">Documentos que o colaborador deve assinar/entregar</p>
          </div>
          <div className="flex items-center gap-2">
            {autoStatus === 'saving' && (
              <span className="flex items-center gap-1 text-[12px] text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" />Salvando…</span>
            )}
            {autoStatus === 'saved' && (
              <span className="flex items-center gap-1 text-[12px] text-emerald-600 font-medium"><Save className="w-3.5 h-3.5" />Salvo automaticamente</span>
            )}
            <span className={`text-[12px] font-semibold px-2.5 py-1 rounded-full ${done === total ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {done}/{total} concluídos
            </span>
          </div>
        </div>

        <div className="space-y-2">
          {COMPANY_DOCS.map(doc => (
            <DocRow
              key={doc.key}
              doc={doc}
              state={docs[doc.key] ?? emptyDoc()}
              onChange={s => setDoc(doc.key, s)}
              candidateId={candidateId}
            />
          ))}
        </div>
      </div>

      {/* Treinamentos */}
      <CustomDocsCard
        title="Treinamentos"
        subtitle="Certificados e comprovantes de treinamentos realizados"
        icon={GraduationCap}
        items={treinamentos}
        setItems={setTreinamentos}
        candidateId={candidateId}
        addLabel="Adicionar treinamento"
      />

      {/* Circulares */}
      <CustomDocsCard
        title="Circulares"
        subtitle="Comunicados e circulares assinados pelo colaborador"
        icon={Megaphone}
        items={circulares}
        setItems={setCirculares}
        candidateId={candidateId}
        addLabel="Adicionar circular"
      />

      {/* Recibos */}
      <CustomDocsCard
        title="Recibos"
        subtitle="Recibos diversos (vale, adiantamento, pagamentos, etc.)"
        icon={Receipt}
        items={recibos}
        setItems={setRecibos}
        candidateId={candidateId}
        addLabel="Adicionar recibo"
      />

      {/* Desligamento (somente desligado) */}
      {showDesligamento && (
        <CustomDocsCard
          title="Desligamento"
          subtitle="Carta de demissão e demais documentos do desligamento"
          icon={LogOut}
          items={desligamentoDocs}
          setItems={setDesligamentoDocs}
          candidateId={candidateId}
          addLabel="Adicionar documento"
          pinnedFile={terminationLetter}
          pinnedLabel="Carta de demissão"
        />
      )}

      {/* Salvar */}
      <Button onClick={handleSave} disabled={saving} className="gap-1.5 w-full sm:w-auto">
        {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Salvando...</> : <><Save className="w-4 h-4" />Salvar documentos</>}
      </Button>
    </div>
  )
}
