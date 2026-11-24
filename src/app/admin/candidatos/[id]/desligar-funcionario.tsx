'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { UserMinus, Loader2, X, Upload, FileText, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { abrirArquivoAssinado } from '@/lib/abrir-arquivo'
import { DIAS_AVISO, fimDoAviso, dataBr, hojeIso } from '@/lib/aviso-previo'

interface Props { candidateId: string; applicationId?: string }

interface ArquivoCarta { url: string; name: string; path: string }

export function DesligarFuncionarioButton({ candidateId, applicationId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState('')
  const [requester, setRequester] = useState('')
  /**
   * Cumprir aviso é o caso comum de quem PEDE demissão, mas vale também
   * quando a empresa desliga: o que muda é só quem pediu.
   */
  const [cumpreAviso, setCumpreAviso] = useState(false)
  const [letter, setLetter] = useState<{ url: string; name: string; path: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function openModal() {
    // Data de hoje em São Paulo: toISOString() devolve a data em UTC e,
    // depois das 21h, abria a janela já no dia seguinte.
    setDate(hojeIso())
    setRequester(''); setLetter(null); setError(''); setCumpreAviso(false); setOpen(true)
  }

  /** Último dia trabalhado quando há aviso (o primeiro dia já conta). */
  const fimAviso = date ? fimDoAviso(date) : ''

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
    if (!date) { setError(cumpreAviso ? 'Informe o início do aviso prévio.' : 'Informe a data do desligamento.'); return }
    if (!requester) { setError('Informe quem solicitou o desligamento.'); return }
    // A carta não trava o desligamento: nem sempre existe no dia, e o registro
    // do desligamento não pode esperar por ela. Dá para anexar depois.
    setSaving(true)
    // Pela API: gravar desligamento direto no banco dependia da policy aberta
    // de `applications` — qualquer conta logada podia desligar qualquer pessoa.
    const res = await fetch(`/api/admin/applications/${applicationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      // Com aviso prévio o status NÃO muda: a pessoa continua contratada
      // (e com acesso) até o último dia, e o cron diário faz o desligamento.
      // Mexer no status agora derrubaria o login dela no Portal na hora.
      body: JSON.stringify(cumpreAviso
        ? {
            aviso_previo_inicio: date,
            aviso_previo_ate: fimAviso,
            termination_data: { requester, letter, date, aviso_previo: true, aviso_fim: fimAviso },
          }
        : {
            status: 'desligado',
            terminated_at: `${date}T12:00:00`,
            aviso_previo_inicio: null,
            aviso_previo_ate: null,
            termination_data: { requester, letter, date, aviso_previo: false },
          }),
    })
    setSaving(false)
    if (!res.ok) {
      // Mostrar o motivo que o servidor deu. O "Erro ao salvar." genérico que
      // ficava aqui escondeu por dias um 403 de permissão — quem usa a tela não
      // tinha como saber que o problema era acesso, e não o arquivo ou a data.
      const d = await res.json().catch(() => ({}))
      setError(d.error || `Não foi possível salvar (erro ${res.status}).`)
      return
    }
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
              {/* Aviso prévio antes da data: é ele que diz o que a data significa. */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">Como será a saída *</label>
                <label className={`flex items-start gap-2 rounded-lg border px-3 py-2 cursor-pointer ${!cumpreAviso ? 'border-rose-300 bg-rose-50' : 'border-gray-200'}`}>
                  <input type="radio" checked={!cumpreAviso} onChange={() => setCumpreAviso(false)} className="mt-0.5 accent-rose-600" />
                  <span className="text-[12.5px]">
                    <strong className="font-semibold text-gray-900">Desligamento imediato</strong>
                    <span className="block text-muted-foreground">Sai agora: vai para os desligados e perde o acesso aos sistemas.</span>
                  </span>
                </label>
                <label className={`flex items-start gap-2 rounded-lg border px-3 py-2 cursor-pointer ${cumpreAviso ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}>
                  <input type="radio" checked={cumpreAviso} onChange={() => setCumpreAviso(true)} className="mt-0.5 accent-amber-600" />
                  <span className="text-[12.5px]">
                    <strong className="font-semibold text-gray-900">Vai cumprir aviso prévio ({DIAS_AVISO} dias)</strong>
                    <span className="block text-muted-foreground">Continua trabalhando, com acesso normal, até o último dia.</span>
                  </span>
                </label>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">
                  {cumpreAviso ? 'Início do aviso prévio *' : 'Data do desligamento *'}
                </label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
                {cumpreAviso && fimAviso && (
                  <p className="text-[11.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
                    Último dia trabalhado: <strong>{dataBr(fimAviso)}</strong>. No dia seguinte o sistema move
                    para os desligados e o acesso cai sozinho.
                  </p>
                )}
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
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserMinus className="w-3.5 h-3.5" />}
                {cumpreAviso ? 'Salvar aviso prévio' : 'Salvar e desligar'}
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
      // Mantém o resto do desligamento (quem pediu, quando) e troca só a carta.
      const salvo = await fetch(`/api/admin/applications/${applicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          termination_data: { ...(terminationData ?? {}), letter: arquivo },
        }),
      })
      if (!salvo.ok) throw new Error('Erro ao salvar.')
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
