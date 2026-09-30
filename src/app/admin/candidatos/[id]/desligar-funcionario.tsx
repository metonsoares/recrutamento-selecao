'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { UserMinus, Loader2, X, Upload, FileText, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { abrirArquivoAssinado } from '@/lib/abrir-arquivo'

interface Props { candidateId: string; applicationId?: string }

interface ArquivoCarta { url: string; name: string; path: string }

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
    // A carta não trava o desligamento: nem sempre existe no dia, e o registro
    // do desligamento não pode esperar por ela. Dá para anexar depois.
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
                  <label className="text-xs font-medium text-gray-600">Carta de demissão (PDF/JPG/PNG)</label>
                  {letter ? (
                    <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-300 rounded-lg px-2.5 py-1.5">
                      <FileText className="w-4 h-4 text-red-500 shrink-0" />
                      <a href={letter.url} onClick={e => abrirArquivoAssinado(e, letter)} target="_blank" rel="noreferrer" className="text-[12px] text-emerald-700 hover:underline truncate flex-1">{letter.name}</a>
                      <button onClick={() => setLetter(null)} className="text-gray-400 hover:text-red-500 shrink-0"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <button disabled={uploading} onClick={() => fileRef.current?.click()}
                      className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-primary hover:text-primary transition-colors disabled:opacity-50 w-full justify-center">
                      {uploading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Enviando...</> : <><Upload className="w-3.5 h-3.5" />Anexar carta de demissão</>}
                    </button>
                  )}
                  <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={handleFile} />
                  {!letter && (
                    <p className="text-[11px] text-muted-foreground">
                      Opcional agora — dá para anexar depois, na ficha do desligado.
                    </p>
                  )}
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

/**
 * Carta de demissão de quem JÁ foi desligado.
 *
 * O botão de desligar some quando a pessoa sai, e a carta costuma chegar
 * depois do registro — sem este painel ela não teria onde entrar.
 */
export function CartaDesligamento({
  candidateId, applicationId, terminationData,
}: {
  candidateId: string
  applicationId?: string
  terminationData: { requester?: string; date?: string; letter?: ArquivoCarta | null } | null
}) {
  const router = useRouter()
  const [letter, setLetter] = useState<ArquivoCarta | null>(terminationData?.letter ?? null)
  const [uploading, setUploading] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  if (!applicationId) return null

  async function anexar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (e.target) e.target.value = ''
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
      const arquivo = { url: d.url as string, name: f.name, path: d.path as string }

      setSalvando(true)
      const supabase = createSupabaseBrowserClient()
      // Mantém o resto do desligamento (quem pediu, quando) e troca só a carta.
      const { error: err } = await supabase.from('applications').update({
        termination_data: { ...(terminationData ?? {}), letter: arquivo },
        updated_at: new Date().toISOString(),
      }).eq('id', applicationId)
      if (err) throw new Error('Erro ao salvar.')
      setLetter(arquivo)
      router.refresh()
    } catch (e) {
      setError((e as Error).message || 'Erro no upload')
    } finally { setUploading(false); setSalvando(false) }
  }

  return (
    <div className="mt-6 border-t pt-5 max-w-3xl">
      <div className="rounded-2xl border bg-white p-4 sm:p-5">
        <div className="flex items-start gap-2.5 flex-wrap">
          <UserMinus className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-[220px]">
            <p className="text-sm font-bold text-gray-900">Carta de demissão</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {letter ? 'Anexada ao desligamento.' : 'Ainda não anexada — envie quando o documento chegar.'}
            </p>
          </div>

          {letter ? (
            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-300 rounded-lg px-2.5 py-1.5 min-w-[200px]">
              <FileText className="w-4 h-4 text-red-500 shrink-0" />
              <a href={letter.url} onClick={e => abrirArquivoAssinado(e, letter)} target="_blank" rel="noreferrer"
                className="text-[12px] text-emerald-700 hover:underline truncate flex-1">{letter.name}</a>
              <button onClick={() => fileRef.current?.click()} title="Trocar arquivo"
                className="text-[11px] font-medium text-gray-500 hover:text-primary shrink-0">Trocar</button>
            </div>
          ) : (
            <Button variant="outline" size="sm" disabled={uploading || salvando}
              onClick={() => fileRef.current?.click()} className="gap-1.5 shrink-0">
              {uploading || salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Anexar carta
            </Button>
          )}
          <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={anexar} />
        </div>
        {error && <p className="mt-2 text-xs text-red-600 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</p>}
      </div>
    </div>
  )
}
