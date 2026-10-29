'use client'
import { useState } from 'react'
import { Eye, Download, Loader2 } from 'lucide-react'
import {
  abrirArquivoAssinado, modoDeAbertura, urlNoVisualizadorOffice,
  type ArquivoRef, type BucketArquivo,
} from '@/lib/abrir-arquivo'

/**
 * Botão "visualizar" de um arquivo do Storage.
 *
 * Clicar no NOME do arquivo baixa; este olho abre numa aba. São ações
 * diferentes de propósito: conferir um atestado não deveria encher a pasta de
 * downloads, e baixar não deveria exigir abrir uma aba antes.
 *
 * A URL é assinada no clique (os buckets são privados), então a aba é aberta
 * antes do await — dentro do helper — para o navegador não bloquear o popup.
 *
 * O FORMATO decide o caminho (ver `modoDeAbertura`): PDF e imagem o navegador
 * desenha; Word e Excel vão pelo visualizador do Office; o que ninguém exibe é
 * baixado — antes disso, um .xlsx mandava a aba para a URL do arquivo e ela
 * ficava em branco, com cara de botão quebrado.
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

  // O nome é a fonte da extensão; sem ele, o caminho no bucket serve.
  const modo = modoDeAbertura(file.name ?? file.path)
  const baixa = modo === 'baixar'

  const rotulo = erro || (baixa
    ? 'Baixar — o navegador não exibe este formato'
    : modo === 'office'
      ? 'Visualizar no visualizador do Office'
      : titulo)

  return (
    <button
      type="button"
      title={rotulo}
      aria-label={rotulo}
      disabled={abrindo}
      onClick={async e => {
        setAbrindo(true)
        const opcoes = modo === 'office'
          ? { envolverUrl: urlNoVisualizadorOffice }
          : modo === 'navegador'
            ? { visualizar: true }
            : {} // baixar
        setErro(await abrirArquivoAssinado(e, file, bucket, opcoes) ?? '')
        setAbrindo(false)
      }}
      className={`p-1 rounded-md shrink-0 transition-colors ${
        erro ? 'text-red-500 hover:bg-red-50' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'
      }`}
    >
      {abrindo
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : baixa ? <Download className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
    </button>
  )
}
