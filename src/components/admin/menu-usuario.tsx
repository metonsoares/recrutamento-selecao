'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Moon, Sun, CircleHelp, History, LogOut } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { definirTema, useTema } from '@/lib/tema'
import { cn } from '@/lib/utils'

/** Iniciais do nome, como nos outros apps da casa (uma do primeiro, uma do último). */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  return ((partes[0][0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase()
}

/**
 * Menu do usuário logado — o mesmo desenho dos outros apps do Portal:
 * avatar com as iniciais à direita do cabeçalho e, dentro dele, os itens
 * padrão da casa (Modo tela preta, Ajuda, Atualizações, Sair).
 *
 * Ficar tudo aqui é o que tira o tema e o Sair de cantos diferentes da tela:
 * quem muda de app encontra as mesmas coisas no mesmo lugar.
 */
export function MenuUsuario({
  nome, perfilLabel, podeVerAtualizacoes, mostrarNome = false,
}: {
  nome: string
  perfilLabel: string
  podeVerAtualizacoes: boolean
  /** Mostra o nome ao lado do avatar (computador); no celular só o avatar cabe. */
  mostrarNome?: boolean
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)
  const tema = useTema()
  const escuro = tema === 'escuro'

  // Fecha ao clicar fora e no Esc: menu que fica preso aberto atrapalha mais
  // que ajuda em tela de celular.
  useEffect(() => {
    if (!aberto) return
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false)
    }
    function esc(e: KeyboardEvent) { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [aberto])

  async function sair() {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const ITEM = 'flex items-center gap-2.5 w-full px-3 h-10 rounded-[6px] text-[14px] text-[#333333] hover:bg-[#f0f0f0] transition-colors'

  return (
    <div className="relative" ref={caixa}>
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label="Menu do usuário"
        className={cn(
          'flex items-center gap-2 rounded-full border border-[#e8e8e8] py-1 pl-1 transition-colors hover:bg-[#f0f0f0]',
          mostrarNome ? 'pr-3' : 'pr-1',
        )}
      >
        <span className="w-8 h-8 rounded-full bg-[#1F4332] text-white text-[11px] font-semibold flex items-center justify-center shrink-0">
          {iniciais(nome)}
        </span>
        {mostrarNome && (
          <span className="max-w-[14rem] truncate text-[14px] text-[#333333]">{nome}</span>
        )}
      </button>

      {aberto && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-60 rounded-xl border border-[#e8e8e8] bg-white p-1 shadow-lg z-50"
        >
          <div className="px-3 py-2">
            <p className="text-[14px] font-medium text-[#333333] break-words">{nome}</p>
            <p className="text-[12px] text-[#8a8a8a]">{perfilLabel}</p>
          </div>
          <div className="h-px bg-[#e8e8e8] my-1" />

          <button type="button" role="menuitem" className={ITEM}
            onClick={() => definirTema(escuro ? 'claro' : 'escuro')}>
            {escuro ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
            {escuro ? 'Modo tela clara' : 'Modo tela preta'}
          </button>

          <Link href="/admin/ajuda" role="menuitem" className={ITEM} onClick={() => setAberto(false)}>
            <CircleHelp className="w-4 h-4 shrink-0" />
            Ajuda
          </Link>

          {podeVerAtualizacoes && (
            <Link href="/admin/atualizacoes" role="menuitem" className={ITEM} onClick={() => setAberto(false)}>
              <History className="w-4 h-4 shrink-0" />
              Atualizações
            </Link>
          )}

          <button type="button" role="menuitem" onClick={sair}
            className="flex items-center gap-2.5 w-full px-3 h-10 rounded-[6px] text-[14px] text-red-600 hover:bg-red-50 transition-colors">
            <LogOut className="w-4 h-4 shrink-0" />
            Sair
          </button>
        </div>
      )}
    </div>
  )
}
