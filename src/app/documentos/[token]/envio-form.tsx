'use client'
import { useRef, useState } from 'react'
import { Loader2, CheckCircle2, AlertCircle, UploadCloud, FileText } from 'lucide-react'
import type { DocPendente } from '@/lib/doc-pendency'

/**
 * Envio de documentos pelo colaborador, pelo link externo.
 *
 * Cada envio devolve a lista de pendências recalculada no servidor — é ela que
 * manda na tela, para o colaborador nunca ver como pendente algo que já mandou
 * (nem o contrário).
 */
export function EnvioDocumentosForm({
  token, primeiroNome, pendentesIniciais,
}: {
  token: string
  primeiroNome: string
  pendentesIniciais: DocPendente[]
}) {
  const [pendentes, setPendentes] = useState<DocPendente[]>(pendentesIniciais)
  const [enviando, setEnviando] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [enviados, setEnviados] = useState<string[]>([])
  const refs = useRef<Record<string, HTMLInputElement | null>>({})

  async function enviar(e: React.ChangeEvent<HTMLInputElement>, docKey: string, label: string) {
    const file = e.target.files?.[0]
    if (e.target) e.target.value = ''
    if (!file) return
    setErro(''); setEnviando(docKey)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('doc_key', docKey)
      const res = await fetch(`/api/public/doc-portal/${token}`, { method: 'POST', body: fd })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.ok) throw new Error(d.error || 'Erro ao enviar o arquivo.')
      setPendentes((d.pendentes as DocPendente[]) ?? [])
      setEnviados(p => [...p, label])
    } catch (err) {
      setErro((err as Error).message || 'Erro ao enviar o arquivo.')
    } finally { setEnviando(null) }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border p-6 sm:p-8 my-6">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
            <FileText className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold text-gray-900">Envio de documentos</h1>
          {primeiroNome && <p className="text-sm text-muted-foreground mt-0.5">Olá, {primeiroNome}!</p>}
        </div>

        {enviados.length > 0 && (
          <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />Recebemos {enviados.length === 1 ? 'seu documento' : `${enviados.length} documentos`}
            </p>
            <p className="text-[12px] text-emerald-700 mt-0.5">{enviados.join(' · ')}</p>
          </div>
        )}

        {pendentes.length === 0 ? (
          <div className="text-center space-y-3 py-4">
            <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
            <p className="text-base font-semibold text-gray-900">Não há documentos para enviar</p>
            <p className="text-sm text-muted-foreground">
              Está tudo em dia. Você já pode fechar esta página.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              Envie os documentos abaixo. Tire uma foto nítida ou escolha um arquivo
              (JPG, PNG ou PDF, até 15 MB).
            </p>

            <div className="space-y-2.5">
              {pendentes.map(d => (
                <div key={d.key} className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
                  <p className="text-sm font-semibold text-gray-900 leading-snug">
                    {d.label}
                    {d.faltam > 1 && (
                      <span className="ml-1.5 text-[11px] font-normal text-amber-700">
                        (faltam {d.faltam} arquivos)
                      </span>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => refs.current[d.key]?.click()}
                    disabled={enviando !== null}
                    className="mt-2 w-full flex items-center justify-center gap-2 border-2 border-dashed border-emerald-300 rounded-xl py-3 text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-60"
                  >
                    {enviando === d.key
                      ? <><Loader2 className="w-4 h-4 animate-spin" /><span className="text-[13px] font-medium">Enviando…</span></>
                      : <><UploadCloud className="w-4 h-4" /><span className="text-[13px] font-semibold">Enviar arquivo ou tirar foto</span></>}
                  </button>
                  <input
                    ref={el => { refs.current[d.key] = el }}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={e => enviar(e, d.key, d.label)}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {erro && (
          <p className="mt-4 text-sm text-red-600 flex items-center gap-1.5 justify-center">
            <AlertCircle className="w-4 h-4 shrink-0" />{erro}
          </p>
        )}
      </div>
    </div>
  )
}
