'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { UserMinus, Loader2, X, Upload, FileText, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

interface Props { candidateId: string; applicationId?: string }

export function DesligarFuncionarioButton({ candidateId, applicationId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState('')
  const [requester, setRequester] = useState('')
  const [letter, setLetter] = useState<{ url: string; name: string; path: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function openModal() {
    setDate(new Date().toISOString().slice(0, 10))
    setRequester(''); setLetter(null); setError(''); setOpen(true)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setError('')
    if (f.size > 4 * 1024 * 1024) { setError('Arquivo excede 4 MB'); return }
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(f.type)) { setError('Use PDF, JPG ou PNG'); return }
    setUploading(true)
    const fd = new FormData(); fd.append('file', f); fd.append('docKey', 'carta-demissao')
    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/admission-docs`, { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setLetter({ url: d.url, name: f.name, path: d.path })
    } catch (e) { setError((e as Error).message || 'Erro no upload') }
    finally { setUploading(false); if (e.target) e.target.value = '' }
  }

  async function handleSave() {
    if (!applicationId) return
    setError('')
    if (!date) { setError('Informe a data do desligamento.'); return }
    if (!requester) { setError('Informe quem solicitou o desligamento.'); return }
    // Carta de demissão só é exigida quando o próprio funcionário solicita o desligamento.
    if (requester === 'funcionario' && !letter) { setError('Anexe a carta de demissão.'); return }
    setSaving(true)
    const supabase = createSupabaseBrowserClient()
    const now = new Date().toISOString()
    const { error: err } = await supabase
      .from('applications')
      .update({
        status: 'desligado',
        terminated_at: `${date}T12:00:00`,
        termination_data: { requester, letter, date },
        updated_at: now,
      })
      .eq('id', applicationId)
    setSaving(false)
    if (err) { setError('Erro ao salvar.'); return }
    setOpen(false)
    router.refresh()
  }

  if (!applicationId) return null

  return (
    <div className="mt-6 border-t pt-5">
      <Button variant="outline" onClick={openModal} className="gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-50">
        <UserMinus className="w-4 h-4" />Desligar funcionário
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-2"><UserMinus className="w-5 h-5 text-rose-600" /><h2 className="text-base font-semibold text-gray-900">Desligar funcionário</h2></div>
              <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Data do desligamento *</label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Solicitante do desligamento *</label>
                <select value={requester} onChange={e => { setRequester(e.target.value); setError(''); if (e.target.value === 'empresa') setLetter(null) }}
                  className="h-9 w-full border border-gray-300 rounded-md px-3 text-sm bg-white">
                  <option value="">Selecionar...</option>
                  <option value="funcionario">Solicitado pelo funcionário</option>
                  <option value="empresa">A empresa está desligando</option>
                </select>
              </div>

              {/* Carta de demissão: apenas quando o desligamento é solicitado pelo funcionário */}
              {requester === 'funcionario' && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Carta de demissão * (PDF/JPG/PNG)</label>
                  {letter ? (
                    <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-300 rounded-lg px-2.5 py-1.5">
                      <FileText className="w-4 h-4 text-red-500 shrink-0" />
                      <a href={letter.url} target="_blank" rel="noreferrer" className="text-[12px] text-emerald-700 hover:underline truncate flex-1">{letter.name}</a>
                      <button onClick={() => setLetter(null)} className="text-gray-400 hover:text-red-500 shrink-0"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <button disabled={uploading} onClick={() => fileRef.current?.click()}
                      className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-primary hover:text-primary transition-colors disabled:opacity-50 w-full justify-center">
                      {uploading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Enviando...</> : <><Upload className="w-3.5 h-3.5" />Anexar carta de demissão</>}
                    </button>
                  )}
                  <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={handleFile} />
                </div>
              )}

              {requester === 'empresa' && (
                <p className="text-xs text-muted-foreground">
                  Carta de demissão não é necessária quando a empresa desliga o funcionário.
                </p>
              )}

              {error && <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</p>}
            </div>

            <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
              <Button variant="destructive" onClick={handleSave} disabled={saving || uploading} className="gap-1.5">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserMinus className="w-3.5 h-3.5" />}Salvar e desligar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
