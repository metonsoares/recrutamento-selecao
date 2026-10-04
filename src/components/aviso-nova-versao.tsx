'use client'
import { useEffect, useState } from 'react'

/**
 * Avisa quando há uma versão nova do app publicada.
 *
 * Mesma barra dos outros apps do Portal (AvisoNovaVersao do monorepo): rodapé
 * centralizado, botão Atualizar e "lembrar depois" por alguns minutos. O que
 * muda aqui é COMO se descobre a versão — os apps Vite comparam o script de
 * entrada do index.html; este compara o commit publicado, que /api/versao
 * devolve, porque no Next as páginas são servidas pelo servidor.
 *
 * Não recarrega sozinho: recarregar no meio de um lançamento de folha perderia
 * o que está digitado.
 */
const INTERVALO_MS = 2 * 60 * 1000
const ADIAR_MS = 10 * 60 * 1000

const VERDE = '#1F4332'
const VERDE_ESCURO = '#143025'

export function AvisoNovaVersao({ versaoAtual }: { versaoAtual: string }) {
  const [novaVersao, setNovaVersao] = useState(false)
  const [adiado, setAdiado] = useState(false)

  useEffect(() => {
    if (!adiado) return
    const id = window.setTimeout(() => setAdiado(false), ADIAR_MS)
    return () => window.clearTimeout(id)
  }, [adiado])

  useEffect(() => {
    // 'dev' = rodando fora da Vercel: não há publicação para comparar.
    if (!versaoAtual || versaoAtual === 'dev') return
    let parado = false

    async function conferir() {
      if (parado || document.visibilityState === 'hidden') return
      try {
        const r = await fetch('/api/versao', { cache: 'no-store' })
        if (!r.ok) return
        const d = await r.json()
        if (typeof d?.versao === 'string' && d.versao !== 'dev' && d.versao !== versaoAtual) {
          setNovaVersao(true)
          parado = true   // achou: para de perguntar
        }
      } catch {
        // sem rede: tenta de novo no próximo ciclo
      }
    }

    const id = window.setInterval(conferir, INTERVALO_MS)
    // Voltar para a aba é quando mais vale conferir: é o momento em que a
    // pessoa retoma o trabalho depois de um tempo longe.
    const aoVoltar = () => { if (document.visibilityState === 'visible') void conferir() }
    document.addEventListener('visibilitychange', aoVoltar)
    window.addEventListener('focus', aoVoltar)
    return () => {
      parado = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', aoVoltar)
      window.removeEventListener('focus', aoVoltar)
    }
  }, [versaoAtual])

  if (!novaVersao || adiado) return null

  return (
    <div
      role="status"
      className="fixed left-1/2 z-[9999] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border bg-white py-2 pl-4 pr-2 shadow-lg"
      style={{
        borderColor: 'rgba(31, 67, 50, 0.3)',
        // Sobe acima da barra de gestos do iPhone.
        bottom: 'max(1rem, calc(env(safe-area-inset-bottom) + 0.5rem))',
      }}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke={VERDE} strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
        <path d="M8 16H3v5" />
      </svg>
      {/* Cor por classe, não inline: no modo tela preta a barra escurece pela
          camada de tema, e cor inline não teria como acompanhar — o recado
          ficava preto no preto. */}
      <p className="min-w-[12rem] flex-1 text-sm text-gray-800">
        Há uma versão nova do app. Salve o que estiver fazendo e atualize.
      </p>
      {/* Em tela estreita os botões descem juntos para uma 2ª linha. */}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-11 shrink-0 rounded-xl px-4 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ backgroundColor: VERDE, outlineColor: VERDE }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = VERDE_ESCURO)}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = VERDE)}
        >
          Atualizar
        </button>
        <button
          type="button"
          onClick={() => setAdiado(true)}
          aria-label="Lembrar depois"
          title="Lembrar depois"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-600 hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ outlineColor: VERDE }}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={2} strokeLinecap="round" className="h-5 w-5">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
