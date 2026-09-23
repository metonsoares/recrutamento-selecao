'use client'
import { useState } from 'react'
import { Link2, Loader2, X, Copy, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Link externo para o colaborador enviar os documentos que faltam.
 *
 * O link é por PESSOA e não expira sozinho: a página pública lê a ficha na
 * hora, mostra só o que ainda falta e avisa quando não falta mais nada. Quem
 * abre o link não vê a ficha nem qualquer outro dado — só a lista de pendências
 * e o botão de enviar.
 *
 * "Gerar outro link" invalida o anterior, para o caso de o endereço ter ido
 * para a pessoa errada.
 */
export function LinkDocumentos({ candidateId }: { candidateId: string }) {
  const [aberto, setAberto] = useState(false)
  const [url, setUrl] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [copiado, setCopiado] = useState(false)

  async function gerar(renovar = false) {
    setCarregando(true); setErro('')
    try {
      if (renovar) {
        const res = await fetch(`/api/admin/candidatos/${candidateId}/doc-portal`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Não consegui invalidar o link anterior.')
      }
      const res = await fetch(`/api/admin/candidatos/${candidateId}/doc-portal`, { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.url) throw new Error(d.error || 'Não consegui gerar o link.')
      setUrl(d.url as string)
      setAberto(true)
    } catch (e) {
      setErro((e as Error).message)
      setAberto(true)
    } finally { setCarregando(false) }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true); setTimeout(() => setCopiado(false), 2000)
    } catch { setErro('Não consegui copiar — selecione o endereço e copie na mão.') }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => (url ? setAberto(true) : gerar())}
        disabled={carregando} className="gap-1.5 shrink-0">
        {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
        Link para documentos
      </Button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setAberto(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Link2 className="w-5 h-5 text-primary" />
                <h2 className="text-base font-semibold">Link para o colaborador enviar documentos</h2>
              </div>
              <button onClick={() => setAberto(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[13px] text-gray-600">
              Encaminhe este endereço para o colaborador. Ele vê apenas os documentos que faltam e
              o botão de enviar — nunca a ficha nem outros dados.
            </p>

            {url && (
              <div className="flex items-center gap-2">
                <input readOnly value={url} onFocus={e => e.currentTarget.select()}
                  className="h-9 flex-1 min-w-0 border border-gray-300 rounded-md px-2.5 text-[12.5px] font-mono bg-gray-50" />
                <Button size="sm" onClick={copiar} className="gap-1.5 shrink-0">
                  {copiado ? <><CheckCircle2 className="w-3.5 h-3.5" />Copiado</> : <><Copy className="w-3.5 h-3.5" />Copiar</>}
                </Button>
              </div>
            )}

            {erro && <p className="text-[12px] text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{erro}</p>}

            <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
              <p className="text-[11.5px] text-muted-foreground">
                Quem tiver o endereço consegue enviar documentos para esta ficha.
              </p>
              <Button variant="outline" size="sm" onClick={() => gerar(true)} disabled={carregando} className="gap-1.5">
                {carregando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Gerar outro link
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
