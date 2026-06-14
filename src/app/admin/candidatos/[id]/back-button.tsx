'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

/**
 * Botão "Voltar" que retorna para a página anterior do histórico do navegador
 * (lista de Candidatos, Em contrato, Freelancers, etc. — de onde o usuário veio).
 * Se não houver histórico (ex.: link aberto direto), cai para /admin/candidatos.
 */
export function BackButton({ label = 'Voltar', fallbackHref = '/admin/candidatos' }: { label?: string; fallbackHref?: string }) {
  const router = useRouter()

  function handleBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push(fallbackHref)
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
