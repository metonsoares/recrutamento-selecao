'use client'
import { useEffect, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'

/**
 * Aviso de versão nova publicada.
 *
 * A aba compara a versão com que foi carregada (vem do servidor, na montagem)
 * com a que está no ar. São páginas de uso longo — alguém deixa a folha de
 * pagamento aberta a manhã inteira — e sem isto continuaria rodando o código
 * antigo até fechar a aba.
 *
 * Só avisa: quem decide a hora de recarregar é a pessoa, porque recarregar no
 * meio de um lançamento perderia o que está digitado.
 */
const INTERVALO_MS = 2 * 60 * 1000

export function AvisoNovaVersao({ versaoAtual }: { versaoAtual: string }) {
  const [novaVersao, setNovaVersao] = useState(false)
  const [dispensado, setDispensado] = useState(false)

  useEffect(() => {
    // 'dev' = rodando fora da Vercel: não há publicação para comparar.
    if (!versaoAtual || versaoAtual === 'dev') return
    let vivo = true

    async function conferir() {
      if (document.visibilityState === 'hidden') return
      try {
        const res = await fetch('/api/versao', { cache: 'no-store' })
        if (!res.ok) return
        const d = await res.json()
        if (vivo && typeof d?.versao === 'string' && d.versao !== 'dev' && d.versao !== versaoAtual) {
          setNovaVersao(true)
        }
      } catch { /* sem rede: tenta de novo no próximo ciclo */ }
    }

    conferir()
    const timer = setInterval(conferir, INTERVALO_MS)
    // Voltar para a aba é quando mais vale conferir: costuma ser o momento em
    // que a pessoa retoma o trabalho depois de um tempo longe.
    document.addEventListener('visibilitychange', conferir)
    return () => {
      vivo = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', conferir)
    }
  }, [versaoAtual])

  if (!novaVersao || dispensado) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-[calc(100vw-2rem)] rounded-2xl border border-emerald-300 bg-white shadow-lg px-4 py-3 flex items-center gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900">Nova versão disponível</p>
        <p className="text-[12px] text-muted-foreground">Atualize para usar a versão mais recente.</p>
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[13px] font-semibold text-white hover:opacity-90 transition-opacity"
      >
        <RefreshCw className="w-3.5 h-3.5" />Atualizar
      </button>
      <button
        type="button"
        onClick={() => setDispensado(true)}
        title="Agora não"
        className="shrink-0 p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
