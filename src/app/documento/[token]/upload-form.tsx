'use client'
import { useState, useRef } from 'react'
import { Loader2, CheckCircle2, AlertCircle, UploadCloud, FileText } from 'lucide-react'

interface Props {
  token: string
  docLabel: string
  candidateName: string
  alreadySent: boolean
}

export function UploadDocForm({ token, docLabel, candidateName, alreadySent }: Props) {
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState(alreadySent)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const firstName = candidateName.split(' ')[0]

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setFileName(file.name)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/public/doc-request/${token}`, { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || 'Erro ao enviar o arquivo.')
      setDone(true)
    } catch (err) {
      setError((err as Error).message || 'Erro ao enviar o arquivo.')
    } finally {
      setUploading(false)
      if (e.target) e.target.value = ''
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border p-6 sm:p-8">
        {/* Cabeçalho */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
            <FileText className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold text-gray-900">Envio de documento</h1>
          {firstName && <p className="text-sm text-muted-foreground mt-0.5">Olá, {firstName}!</p>}
        </div>

        {done ? (
          <div className="text-center space-y-3 py-4">
            <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
            <p className="text-base font-semibold text-gray-900">Documento recebido!</p>
            <p className="text-sm text-muted-foreground">
              O documento <strong>{docLabel}</strong> foi enviado e adicionado à sua ficha. Obrigado!
            </p>
            <p className="text-[12px] text-muted-foreground">Você já pode fechar esta página.</p>
          </div>
        ) : (
          <>
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
              <p className="text-[12px] text-amber-700 font-medium uppercase tracking-wide mb-0.5">Documento solicitado</p>
              <p className="text-sm font-semibold text-gray-900">{docLabel}</p>
            </div>

            <p className="text-sm text-muted-foreground mb-4 text-center">
              Tire uma foto nítida do documento ou selecione um arquivo (JPG, PNG ou PDF) para enviar.
            </p>

            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed border-emerald-300 rounded-2xl py-8 text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-60"
            >
              {uploading ? (
                <><Loader2 className="w-8 h-8 animate-spin" /><span className="text-sm font-medium">Enviando{fileName ? ` ${fileName}` : ''}...</span></>
              ) : (
                <><UploadCloud className="w-8 h-8" /><span className="text-sm font-semibold">Selecionar arquivo ou tirar foto</span><span className="text-[11px] text-muted-foreground">JPG, PNG ou PDF · até 15 MB</span></>
              )}
            </button>

            <input
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={handleFile}
            />

            {error && (
              <p className="mt-4 text-sm text-red-600 flex items-center gap-1.5 justify-center">
                <AlertCircle className="w-4 h-4 shrink-0" />{error}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
