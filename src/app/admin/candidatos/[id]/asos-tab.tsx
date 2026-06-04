'use client'
import { useState, useRef } from 'react'
import {
  Loader2, Save, CheckCircle2, AlertCircle, Plus, Trash2, Upload, FileText, X,
  Stethoscope, CalendarClock, Activity,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/helpers'

interface UploadedFile { url: string; name: string; path: string }
interface ExamEntry { id: string; date: string; file: UploadedFile | null }
interface Afastamento { id: string; afastamento_date: string; afastamento_file: UploadedFile | null; retorno_date: string; retorno_file: UploadedFile | null }

export interface AsoData {
  admissional: { date: string; file: UploadedFile | null }
  periodicos: ExamEntry[]
  demissional: { date: string; file: UploadedFile | null }
  afastamentos: Afastamento[]
}

interface Props {
  candidateId: string
  isDesligado: boolean
  initialData: AsoData | null
  admissionalFile: UploadedFile | null  // da ficha cadastral (atestado admissional)
}

function makeEmpty(): AsoData {
  return { admissional: { date: '', file: null }, periodicos: [], demissional: { date: '', file: null }, afastamentos: [] }
}
function genId() { return (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now() + Math.random()) }
function addYear(iso: string): string { if (!iso) return ''; const d = new Date(iso + 'T00:00:00'); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10) }

// ─── Upload inline ────────────────────────────────────────────────────────────

function FileSlot({ candidateId, file, onChange, label = 'Anexar exame' }: {
  candidateId: string; file: UploadedFile | null; onChange: (f: UploadedFile | null) => void; label?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')

  async function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return; setErr('')
    if (f.size > 4 * 1024 * 1024) { setErr('Máx 4 MB'); return }
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(f.type)) { setErr('PDF/JPG/PNG'); return }
    setUploading(true)
    const fd = new FormData(); fd.append('file', f); fd.append('docKey', 'aso')
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/admission-docs`, { method: 'POST', body: fd })
      const d = await res.json(); if (!res.ok) throw new Error(d.error)
      onChange({ url: d.url, name: f.name, path: d.path })
    } catch (e) { setErr((e as Error).message || 'Erro') }
    finally { setUploading(false); if (e.target) e.target.value = '' }
  }

  return file ? (
    <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-300 rounded-lg px-2.5 py-1.5">
      <FileText className="w-3.5 h-3.5 text-red-500 shrink-0" />
      <a href={file.url} target="_blank" rel="noreferrer" className="text-[11px] text-emerald-700 hover:underline truncate flex-1">{file.name}</a>
      <button onClick={() => onChange(null)} className="text-gray-400 hover:text-red-500 shrink-0"><X className="w-3.5 h-3.5" /></button>
    </div>
  ) : (
    <div>
      <button disabled={uploading} onClick={() => ref.current?.click()}
        className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-primary hover:text-primary transition-colors disabled:opacity-50 w-full justify-center">
        {uploading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Enviando...</> : <><Upload className="w-3.5 h-3.5" />{label}</>}
      </button>
      <input ref={ref} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={handle} />
      {err && <p className="text-[11px] text-red-600 mt-0.5">{err}</p>}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function AsosTab({ candidateId, isDesligado, initialData, admissionalFile }: Props) {
  const [form, setForm] = useState<AsoData>(() => {
    const base = initialData ? { ...makeEmpty(), ...initialData } : makeEmpty()
    // pré-preenche o arquivo admissional da ficha, se ainda não houver
    if (!base.admissional.file && admissionalFile) base.admissional = { ...base.admissional, file: admissionalFile }
    return base
  })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  function showToast(type: 'ok' | 'err', msg: string) { setToast({ type, msg }); setTimeout(() => setToast(null), 4000) }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/aso-data`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      const json = await res.json(); if (!res.ok) throw new Error(json.error)
      showToast('ok', 'ASOs salvos.')
    } catch (e) { showToast('err', (e as Error).message || 'Erro ao salvar.') }
    finally { setSaving(false) }
  }

  // próximo periódico sugerido = último exame (admissional ou último periódico) + 1 ano
  const ultimaData = form.periodicos.length
    ? form.periodicos.map(p => p.date).filter(Boolean).sort().slice(-1)[0]
    : form.admissional.date
  const proximoPeriodico = ultimaData ? addYear(ultimaData) : ''
  const periodicoVencido = proximoPeriodico && proximoPeriodico < new Date().toISOString().slice(0, 10)

  function addPeriodico() { setForm(p => ({ ...p, periodicos: [...p.periodicos, { id: genId(), date: proximoPeriodico || '', file: null }] })) }
  function addAfastamento() { setForm(p => ({ ...p, afastamentos: [...p.afastamentos, { id: genId(), afastamento_date: '', afastamento_file: null, retorno_date: '', retorno_file: null }] })) }

  return (
    <div className="max-w-3xl space-y-4">
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}{toast.msg}
        </div>
      )}

      {/* ASOs */}
      <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-5">
        <div className="flex items-center gap-2">
          <Stethoscope className="w-5 h-5 text-[#333]" />
          <h2 className="text-base font-bold text-gray-900">ASOs — Atestados de Saúde Ocupacional</h2>
        </div>

        {/* Admissional */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800">Exame admissional</p>
            <span className="text-[10px] text-muted-foreground">arquivo buscado da ficha cadastral</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-600">Data do exame</label>
              <Input type="date" value={form.admissional.date} onChange={e => setForm(p => ({ ...p, admissional: { ...p.admissional, date: e.target.value } }))} />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-600">Arquivo</label>
              <FileSlot candidateId={candidateId} file={form.admissional.file} onChange={f => setForm(p => ({ ...p, admissional: { ...p.admissional, file: f } }))} />
            </div>
          </div>
        </div>

        {/* Periódicos */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800">Exames periódicos</p>
            {proximoPeriodico && (
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${periodicoVencido ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                <CalendarClock className="w-3 h-3 inline mr-1" />
                Próximo até {formatDate(proximoPeriodico)}{periodicoVencido ? ' (vencido)' : ''}
              </span>
            )}
          </div>
          {form.periodicos.map(ex => (
            <div key={ex.id} className="rounded-lg border p-2 grid grid-cols-[150px_1fr_auto] gap-2 items-center">
              <Input type="date" value={ex.date} className="h-8 text-sm"
                onChange={e => setForm(p => ({ ...p, periodicos: p.periodicos.map(x => x.id === ex.id ? { ...x, date: e.target.value } : x) }))} />
              <FileSlot candidateId={candidateId} file={ex.file}
                onChange={f => setForm(p => ({ ...p, periodicos: p.periodicos.map(x => x.id === ex.id ? { ...x, file: f } : x) }))} />
              <button onClick={() => setForm(p => ({ ...p, periodicos: p.periodicos.filter(x => x.id !== ex.id) }))} className="text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addPeriodico} className="gap-1.5"><Plus className="w-3.5 h-3.5" />Adicionar exame periódico</Button>
        </div>

        {/* Demissional */}
        {isDesligado && (
          <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3 space-y-2">
            <p className="text-sm font-semibold text-gray-800">Exame demissional</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-gray-600">Data do exame</label>
                <Input type="date" value={form.demissional.date} onChange={e => setForm(p => ({ ...p, demissional: { ...p.demissional, date: e.target.value } }))} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-gray-600">Arquivo</label>
                <FileSlot candidateId={candidateId} file={form.demissional.file} onChange={f => setForm(p => ({ ...p, demissional: { ...p.demissional, file: f } }))} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Afastamentos */}
      <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-[#333]" />
          <h2 className="text-base font-bold text-gray-900">Afastamentos</h2>
        </div>
        {form.afastamentos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum afastamento registrado.</p>}
        {form.afastamentos.map(af => (
          <div key={af.id} className="rounded-xl border p-3 space-y-2">
            <div className="flex justify-end">
              <button onClick={() => setForm(p => ({ ...p, afastamentos: p.afastamentos.filter(x => x.id !== af.id) }))} className="text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-gray-600">Exame de afastamento — data</label>
                <Input type="date" value={af.afastamento_date}
                  onChange={e => setForm(p => ({ ...p, afastamentos: p.afastamentos.map(x => x.id === af.id ? { ...x, afastamento_date: e.target.value } : x) }))} />
                <FileSlot candidateId={candidateId} file={af.afastamento_file}
                  onChange={f => setForm(p => ({ ...p, afastamentos: p.afastamentos.map(x => x.id === af.id ? { ...x, afastamento_file: f } : x) }))} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-gray-600">Exame de retorno — data</label>
                <Input type="date" value={af.retorno_date}
                  onChange={e => setForm(p => ({ ...p, afastamentos: p.afastamentos.map(x => x.id === af.id ? { ...x, retorno_date: e.target.value } : x) }))} />
                <FileSlot candidateId={candidateId} file={af.retorno_file}
                  onChange={f => setForm(p => ({ ...p, afastamentos: p.afastamentos.map(x => x.id === af.id ? { ...x, retorno_file: f } : x) }))} />
              </div>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addAfastamento} className="gap-1.5"><Plus className="w-3.5 h-3.5" />Adicionar afastamento</Button>
      </div>

      {/* Salvar */}
      <Button onClick={save} disabled={saving} className="gap-1.5 w-full sm:w-auto">
        {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Salvando...</> : <><Save className="w-4 h-4" />Salvar ASOs</>}
      </Button>
    </div>
  )
}
