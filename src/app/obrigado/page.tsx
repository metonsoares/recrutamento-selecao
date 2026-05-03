'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function ObrigadoPage() {
  // Garante limpeza da sessão caso o usuário chegue aqui por outro caminho
  useEffect(() => {
    ;['brownie_respondent_id', 'brownie_respondent_name',
      'brownie_respondent_role', 'brownie_survey_answers',
      'brownie_survey_section'].forEach((k) => sessionStorage.removeItem(k))
  }, [])

  return (
    <main className="min-h-screen brand-gradient flex flex-col items-center justify-center px-5 text-white">
      <div className="max-w-sm w-full text-center space-y-7 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Ícone animado */}
        <div className="w-24 h-24 rounded-full bg-white/15 border-2 border-white/30 flex items-center justify-center mx-auto">
          <svg
            className="w-12 h-12 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        {/* Texto */}
        <div className="space-y-3">
          <h1 className="text-3xl font-bold">Obrigado!</h1>
          <p className="text-base opacity-90 leading-relaxed">
            Suas respostas foram enviadas com sucesso.
          </p>
          <p className="text-sm opacity-70 leading-relaxed">
            Agradecemos por dedicar seu tempo a esta pesquisa. Seu feedback é muito
            importante para o crescimento do nosso time e da empresa.
          </p>
        </div>

        {/* Marca */}
        <div className="pt-2">
          <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-2">
            <span className="text-xs font-semibold uppercase tracking-widest opacity-80">
              Brownie do Ton
            </span>
          </div>
        </div>
      </div>

      {/* Link discreto — permite que outro funcionário use o mesmo dispositivo */}
      <Link
        href="/"
        className="fixed bottom-6 text-xs text-white/35 hover:text-white/70 transition-colors"
      >
        Responder novamente
      </Link>
    </main>
  )
}
