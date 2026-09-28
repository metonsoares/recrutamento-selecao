'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell, Palmtree, Cake, FileWarning, FileCheck2, CalendarClock, Loader2 } from 'lucide-react'

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

function quando(iso: string): string {
  const minutos = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (minutos < 60) return `há ${minutos} min`
  const horas = Math.round(minutos / 60)
  if (horas < 24) return `há ${horas} h`
  const dias = Math.round(horas / 24)
  return `há ${dias} dia${dias === 1 ? '' : 's'}`
}

/**
 * Sino de avisos do painel.
 *
 * A lista vem do servidor, que recalcula os prazos na hora — assim um aviso
 * deixa de aparecer quando o motivo dele desaparece (férias agendadas,
 * documento renovado), sem depender de rotina agendada.
 */
export function SinoNotificacoes() {
  const [itens, setItens] = useState<Notificacao[]>([])
  const [naoLidas, setNaoLidas] = useState(0)
  const [aberto, setAberto] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)

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

  // Fecha ao clicar fora — o painel cobre conteúdo da página.
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  async function marcar(id?: string) {
    const corpo = id ? { id } : { todas: true }
    setItens(p => p.map(i => (id ? (i.id === id ? { ...i, lida_em: new Date().toISOString() } : i) : { ...i, lida_em: new Date().toISOString() })))
    setNaoLidas(n => (id ? Math.max(0, n - 1) : 0))
    await fetch('/api/admin/notificacoes', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
    }).catch(() => {})
  }

  return (
    <div className="relative shrink-0" ref={caixa}>
      <button
        type="button"
        onClick={() => { setAberto(a => !a); if (!aberto) buscar() }}
        aria-label={naoLidas ? `${naoLidas} avisos não lidos` : 'Avisos'}
        className="relative p-1.5 rounded-lg text-[#8a8a8a] hover:text-[#333] hover:bg-gray-100 transition-colors"
      >
        <Bell className="w-[18px] h-[18px]" />
        {naoLidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {naoLidas > 9 ? '9+' : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 top-9 z-50 w-[320px] max-w-[calc(100vw-2rem)] rounded-2xl border bg-white shadow-xl overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b">
            <p className="text-sm font-semibold text-gray-900">Avisos</p>
            {naoLidas > 0 && (
              <button onClick={() => marcar()} className="text-[11.5px] font-medium text-primary hover:underline">
                Marcar todas como lidas
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {carregando && itens.length === 0 && (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /><span className="text-[13px]">Carregando…</span>
              </div>
            )}

            {!carregando && itens.length === 0 && (
              <p className="py-8 text-center text-[13px] text-muted-foreground">Nenhum aviso por aqui.</p>
            )}

            {itens.map(n => {
              const { Icon, cor } = ICONE[n.tipo] ?? { Icon: Bell, cor: 'text-gray-500 bg-gray-100' }
              const conteudo = (
                <div className={`flex items-start gap-2.5 px-4 py-2.5 hover:bg-gray-50 transition-colors ${n.lida_em ? 'opacity-60' : ''}`}>
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${cor}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-gray-900 leading-snug">{n.titulo}</p>
                    {n.descricao && <p className="text-[12px] text-muted-foreground leading-snug">{n.descricao}</p>}
                    <p className="text-[11px] text-gray-400 mt-0.5">{quando(n.criada_em)}</p>
                  </div>
                  {!n.lida_em && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 mt-1.5" />}
                </div>
              )
              return n.url ? (
                <Link key={n.id} href={n.url} onClick={() => { marcar(n.id); setAberto(false) }} className="block border-b last:border-b-0">
                  {conteudo}
                </Link>
              ) : (
                <button key={n.id} onClick={() => marcar(n.id)} className="block w-full text-left border-b last:border-b-0">
                  {conteudo}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
