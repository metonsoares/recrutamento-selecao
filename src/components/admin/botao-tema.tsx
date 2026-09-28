'use client'
import { Moon, Sun } from 'lucide-react'
import { definirTema, useTema } from '@/lib/tema'

/**
 * Liga e desliga o modo tela preta.
 *
 * Fica ao lado do sino, no cabeçalho: é ajuste de conforto que a pessoa mexe
 * quando a luz do ambiente muda, não algo escondido em Configurações.
 */
export function BotaoTema() {
  const tema = useTema()
  const escuro = tema === 'escuro'

  return (
    <button
      type="button"
      onClick={() => definirTema(escuro ? 'claro' : 'escuro')}
      aria-pressed={escuro}
      title={escuro ? 'Voltar à tela clara' : 'Modo tela preta'}
      aria-label={escuro ? 'Voltar à tela clara' : 'Modo tela preta'}
      className="p-1.5 rounded-lg text-[#8a8a8a] hover:text-[#333] hover:bg-gray-100 transition-colors"
    >
      {escuro ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
    </button>
  )
}
