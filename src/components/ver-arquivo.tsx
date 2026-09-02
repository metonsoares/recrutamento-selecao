'use client'
import { useState } from 'react'
import { Eye, Loader2 } from 'lucide-react'
import { abrirArquivoAssinado, ArquivoRef, BucketArquivo } from '@/lib/abrir-arquivo'

/**
 * Botão "visualizar" de um arquivo do Storage.
 *
 * Clicar no NOME do arquivo baixa; este olho abre numa aba. São ações
 * diferentes de propósito: conferir um atestado não deveria encher a pasta de
 * downloads, e baixar não deveria exigir abrir uma aba antes.
 *
 * A URL é assinada no clique (os buckets são privados), então a aba é aberta
 * antes do await — dentro do helper — para o navegador não bloquear o popup.
 */
export function VerArquivo({
  file, bucket = 'admission-docs', titulo = 'Visualizar',
}: {
  file: ArquivoRef | null | undefined
  bucket?: BucketArquivo
  titulo?: string
}) {
  const [abrindo, setAbrindo] = useState(false)
  const [erro, setErro] = useState('')

  if (!file?.path && !file?.url) return null

  return (
    <button
      type="button"
      title={erro || titulo}
      disabled={abrindo}
      onClick={async e => {
        setAbrindo(true)
        setErro(await abrirArquivoAssinado(e, file, bucket, { envolverUrl: u => u }) ?? '')
        setAbrindo(false)
      }}
      className={`p-1 rounded-md shrink-0 transition-colors ${
        erro ? 'text-red-500 hover:bg-red-50' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'
      }`}
    >
      {abrindo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
    </button>
  )
}
