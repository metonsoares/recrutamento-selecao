'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

/**
 * Destino do "Voltar" conforme o status do candidato. Status que têm página
 * própria (Freelancers, Contratados, etc.) levam o usuário de volta àquela
 * listagem; os demais voltam para o quadro principal de Candidatos.
 */
const STATUS_BACK: Record<string, { href: string; label: string }> = {
  freelancer:   { href: '/admin/candidatos/freelancers',  label: 'Freelancers' },
  contratado:   { href: '/admin/candidatos/contratados',  label: 'Contratados' },
  em_contrato:  { href: '/admin/candidatos/em-contrato',  label: 'Em contrato' },
  desligado:    { href: '/admin/candidatos/desligados',   label: 'Desligados' },
  aprovado:     { href: '/admin/candidatos/intermitentes', label: 'Intermitentes' },
  banco_de_talentos: { href: '/admin/candidatos/intermitentes', label: 'Intermitentes' },
}

/**
 * Botão "Voltar" da ficha do candidato.
 * - Se o status tem uma página de listagem própria, vai direto para ela.
 * - Caso contrário, volta para a página anterior do histórico (router.back),
 *   com fallback para o quadro de Candidatos.
 */
export function BackButton({ status }: { status?: string | null }) {
  const router = useRouter()
  const dest = status ? STATUS_BACK[status] : undefined
  const label = dest?.label ?? 'Candidatos'

  function handleBack() {
    if (dest) { router.push(dest.href); return }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push('/admin/candidatos')
    }
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft className="w-4 h-4" />
      {label}
    </button>
  )
}
