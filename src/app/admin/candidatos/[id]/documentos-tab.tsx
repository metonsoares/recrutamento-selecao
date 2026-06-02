'use client'
import { useState, useRef } from 'react'
import {
  Upload, X, FileText, CheckCircle2, AlertCircle, Clock,
  Loader2, Save,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface UploadedFile { url: string; name: string; path: string }

interface DocState {
  not_applicable: boolean
  files: UploadedFile[]
}

// ─── Lista de documentos da empresa ──────────────────────────────────────────

const COMPANY_DOCS = [
  { key: 'ficha_registro',      label: 'Ficha de registro',                              multiple: false, na: false },
  { key: 'contrato_experiencia',label: 'Contrato de experiência',                        multiple: false, na: false },
  { key: 'contrato_trabalho',   label: 'Contrato de trabalho corporativo',               multiple: false, na: false },
  { key: 'regulamento_interno', label: 'Regulamento interno',                            multiple: false, na: false },
  { key: 'banco_horas',         label: 'Acordo individual de banco de horas',            multiple: false, na: true  },
  { key: 'cessao_imagem',       label: 'Termo de cessão de imagem',                      multiple: false, na: false },
  { key: 'vale_transporte',     label: 'Termo declaração vale transporte',               multiple: false, na: true  },
  { key: 'uniformes_epis',      label: 'Termo entrega de uniformes/EPIs',                multiple: false, na: false },
  { key: 'acrm_geral',          label: 'Termo entrega geral - ACRM',                    multiple: true,  na: false },
  { key: 'acrm_escala',         label: 'ACRM - Acordo individual de escala 12×36',      multiple: false, na: true  },
  { key: 'manipulacao',         label: 'Certificado de manipulação de alimentos',        multiple: false, na: false },
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
    if (file.size > 4 * 1024 * 1024) { setUploadError('Arquivo excede 4 MB'); return }
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
      setUploadError('Use PDF, JPG ou PNG'); return
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
      const newFiles = doc.multiple ? [...files, { url: data.url, name: file.name, path: data.path }]
                                    : [{ url: data.url, name: file.name, path: data.path }]
      onChange({ ...state, files: newFiles })
    } catch (err) {
      setUploadError((err as Error).message || 'Erro no upload')
    } finally {
      setUploading(false)
      if (e.target) e.target.value = ''
    }
  }

  async function handleRemove(idx: number) {
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
          {doc.multiple && <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">(múltiplos arquivos)</span>}
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

          {/* Upload button — sempre visível para múltiplos; só quando sem arquivo para single */}
          {(doc.multiple || files.length === 0) && (
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
          <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={handleFile} />
          {uploadError && <p className="text-[11px] text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{uploadError}</p>}
        </div>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props {
  candidateId: string
  initialDocs: Record<string, unknown> | null
}

export function DocumentosTab({ candidateId, initialDocs }: Props) {
  const [docs, setDocs] = useState<Record<string, DocState>>(() => initDocs(initialDocs))
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  function setDoc(key: string, val: DocState) {
    setDocs(prev => ({ ...prev, [key]: val }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/company-docs`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(docs),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setToast({ type: 'ok', msg: 'Documentos salvos!' })
    } catch (e) {
      setToast({ type: 'err', msg: (e as Error).message || 'Erro ao salvar.' })
    } finally {
      setSaving(false)
      setTimeout(() => setToast(null), 4000)
    }
  }

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
          <span className={`text-[12px] font-semibold px-2.5 py-1 rounded-full ${done === total ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            {done}/{total} concluídos
          </span>
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

      {/* Salvar */}
      <Button onClick={handleSave} disabled={saving} className="gap-1.5 w-full sm:w-auto">
        {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Salvando...</> : <><Save className="w-4 h-4" />Salvar documentos</>}
      </Button>
    </div>
  )
}
