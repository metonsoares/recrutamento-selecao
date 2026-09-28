'use client'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Bell, Palmtree, Cake, FileWarning, FileCheck2, CalendarClock, Loader2, X } from 'lucide-react'

interface Notificacao {
  id: string
  tipo: string
  titulo: string
  descricao: string | null
  url: string | null
  criada_em: string
  lida_em: string | null
}

const ICONE: Record<string, { Icon: React.ElementType; cor: string }> = {
  documento_enviado: { Icon: FileCheck2, cor: 'text-emerald-600 bg-emerald-50' },
  ferias: { Icon: Palmtree, cor: 'text-amber-700 bg-amber-50' },
  doc_empresa: { Icon: FileWarning, cor: 'text-red-600 bg-red-50' },
  aniversario: { Icon: Cake, cor: 'text-pink-600 bg-pink-50' },
  experiencia: { Icon: CalendarClock, cor: 'text-blue-600 bg-blue-50' },
}

/** Abaixo disso o painel vira folha inferior: sobra pouca largura e o polegar manda. */
const LARGURA_FOLHA = 640
const LARGURA_PAINEL = 360
const MARGEM = 8

function quando(iso: string): string {
  const minutos = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (minutos < 1) return 'agora'
  if (minutos < 60) return `há ${minutos} min`
  const horas = Math.round(minutos / 60)
  if (horas < 24) return `há ${horas} h`
  const dias = Math.round(horas / 24)
  return `há ${dias} dia${dias === 1 ? '' : 's'}`
}

/**
 * Sino de avisos do painel.
 *
 * O painel é renderizado em PORTAL no body, não dentro da barra lateral: ancorado
 * ali ele nascia dentro de uma coluna de 288px e aparecia cortado. Fora dela, a
 * posição é calculada a partir do botão e presa à janela.
 *
 * Em tela estreita vira folha inferior — é onde o polegar alcança, e assim o
 * painel não briga com o cabeçalho fixo do celular.
 *
 * A lista vem do servidor, que recalcula os prazos na hora: um aviso some quando
 * o motivo dele desaparece (férias agendadas, documento renovado).
 */
export function SinoNotificacoes() {
  const [itens, setItens] = useState<Notificacao[]>([])
  const [naoLidas, setNaoLidas] = useState(0)
  const [aberto, setAberto] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [folha, setFolha] = useState(false)
  const botao = useRef<HTMLButtonElement>(null)
  const painel = useRef<HTMLDivElement>(null)

  const buscar = useCallback(async () => {
    setCarregando(true)
    try {
      const res = await fetch('/api/admin/notificacoes', { cache: 'no-store' })
      if (!res.ok) return
      const d = await res.json()
      setItens((d.itens as Notificacao[]) ?? [])
      setNaoLidas(Number(d.naoLidas) || 0)
    } catch { /* sem rede: tenta no próximo ciclo */ }
    finally { setCarregando(false) }
  }, [])

  useEffect(() => {
    // Primeira busca fora do corpo do efeito: chamar direto dispara setState
    // sincronamente na montagem e cascateia render.
    const inicial = setTimeout(buscar, 0)
    const timer = setInterval(buscar, 5 * 60 * 1000)
    return () => { clearTimeout(inicial); clearInterval(timer) }
  }, [buscar])

  // Posição presa ao botão. Escrita direto no elemento (não em estado): é
  // medida de layout, e passar por estado rerenderiza a cada rolagem.
  const posicionar = useCallback(() => {
    const alvo = painel.current
    const r = botao.current?.getBoundingClientRect()
    if (!alvo || !r) return
    const estreito = window.innerWidth < LARGURA_FOLHA
    if (estreito !== folha) setFolha(estreito)
    if (estreito) return   // folha inferior: a posição vem do CSS
    const top = r.bottom + MARGEM
    // Abre para a DIREITA do sino: alinhado à direita ele cobriria o menu, já
    // que o sino fica na barra lateral, perto da borda esquerda da tela.
    const left = Math.min(
      Math.max(MARGEM, r.left - MARGEM),
      window.innerWidth - LARGURA_PAINEL - MARGEM,
    )
    alvo.style.top = `${top}px`
    alvo.style.left = `${left}px`
    alvo.style.maxHeight = `${Math.max(200, window.innerHeight - top - MARGEM * 2)}px`
    alvo.style.visibility = 'visible'
  }, [folha])

  useLayoutEffect(() => {
    if (!aberto) return
    const id = requestAnimationFrame(posicionar)
    window.addEventListener('resize', posicionar)
    window.addEventListener('scroll', posicionar, true)
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('resize', posicionar)
      window.removeEventListener('scroll', posicionar, true)
    }
  }, [aberto, posicionar])

  // Fecha ao clicar fora e no Esc — o painel cobre conteúdo da página.
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node
      if (painel.current?.contains(alvo) || botao.current?.contains(alvo)) return
      setAberto(false)
    }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', tecla)
    }
  }, [aberto])

  async function marcar(id?: string) {
    const agora = new Date().toISOString()
    setItens(p => p.map(i => (id ? (i.id === id ? { ...i, lida_em: agora } : i) : { ...i, lida_em: agora })))
    setNaoLidas(n => (id ? Math.max(0, n - 1) : 0))
    await fetch('/api/admin/notificacoes', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(id ? { id } : { todas: true }),
    }).catch(() => {})
  }

  const lista = (
    <>
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b shrink-0">
        <p className="text-sm font-semibold text-gray-900">Avisos</p>
        <div className="flex items-center gap-2">
          {naoLidas > 0 && (
            <button onClick={() => marcar()} className="text-[12px] font-medium text-primary hover:underline">
              Marcar todas como lidas
            </button>
          )}
          <button onClick={() => setAberto(false)} aria-label="Fechar avisos"
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        {carregando && itens.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /><span className="text-[13px]">Carregando…</span>
          </div>
        )}

        {!carregando && itens.length === 0 && (
          <p className="py-10 text-center text-[13px] text-muted-foreground">Nenhum aviso por aqui.</p>
        )}

        {itens.map(n => {
          const { Icon, cor } = ICONE[n.tipo] ?? { Icon: Bell, cor: 'text-gray-500 bg-gray-100' }
          const conteudo = (
            <div className={`flex items-start gap-2.5 px-4 py-3 hover:bg-gray-50 transition-colors ${n.lida_em ? 'opacity-60' : ''}`}>
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${cor}`}>
                <Icon className="w-3.5 h-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-gray-900 leading-snug break-words">{n.titulo}</p>
                {n.descricao && <p className="text-[12px] text-muted-foreground leading-snug break-words mt-0.5">{n.descricao}</p>}
                <p className="text-[11px] text-gray-400 mt-1">{quando(n.criada_em)}</p>
              </div>
              {!n.lida_em && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 mt-1.5" aria-label="não lido" />}
            </div>
          )
          return n.url ? (
            <Link key={n.id} href={n.url} onClick={() => { marcar(n.id); setAberto(false) }}
              className="block border-b last:border-b-0">
              {conteudo}
            </Link>
          ) : (
            <button key={n.id} onClick={() => marcar(n.id)} className="block w-full text-left border-b last:border-b-0">
              {conteudo}
            </button>
          )
        })}
      </div>
    </>
  )

  return (
    <>
      <button
        ref={botao}
        type="button"
        onClick={() => {
          const abrindo = !aberto
          setAberto(abrindo)
          if (abrindo) { setFolha(window.innerWidth < LARGURA_FOLHA); buscar() }
        }}
        aria-label={naoLidas ? `Avisos: ${naoLidas} não lidos` : 'Avisos'}
        aria-expanded={aberto}
        aria-haspopup="dialog"
        className="relative p-1.5 rounded-lg text-[#8a8a8a] hover:text-[#333] hover:bg-gray-100 transition-colors"
      >
        <Bell className="w-[18px] h-[18px]" />
        {naoLidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {naoLidas > 9 ? '9+' : naoLidas}
          </span>
        )}
      </button>

      {aberto && createPortal(
        folha ? (
          // Tela estreita: folha inferior, ao alcance do polegar.
          <>
            <div className="fixed inset-0 z-[70] bg-black/30" aria-hidden="true" />
            <div
              ref={painel}
              role="dialog"
              aria-label="Avisos"
              className="fixed inset-x-2 z-[71] flex flex-col rounded-2xl border bg-white shadow-xl overflow-hidden"
              style={{
                bottom: 'max(0.5rem, calc(env(safe-area-inset-bottom) + 0.25rem))',
                maxHeight: 'min(75svh, calc(100svh - 4.5rem))',
              }}
            >
              {lista}
            </div>
          </>
        ) : (
          <div
            ref={painel}
            role="dialog"
            aria-label="Avisos"
            className="fixed z-[70] flex flex-col rounded-2xl border bg-white shadow-xl overflow-hidden"
            style={{ width: LARGURA_PAINEL, visibility: 'hidden' }}
          >
            {lista}
          </div>
        ),
        document.body,
      )}
    </>
  )
}
