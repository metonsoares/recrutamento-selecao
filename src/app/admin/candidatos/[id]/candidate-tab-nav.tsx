'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FileText, FileDown, Shield, ClipboardList } from 'lucide-react'

interface Props {
  candidateId: string
  printUrl: string
  /** Se o candidato tem CPF para Check Processos */
  hasCpf: boolean
}

export function CandidateTabNav({ candidateId, printUrl, hasCpf }: Props) {
  const pathname = usePathname()
  const isFicha = pathname.includes('/ficha-admissao')

  const base = 'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all border'
  const active = 'bg-white border-gray-300 shadow-sm text-gray-900'
  const inactive = 'bg-transparent border-transparent text-gray-500 hover:text-gray-800 hover:bg-white/60'

  return (
    <div className="flex flex-wrap items-center gap-2 p-1 bg-gray-100/80 rounded-xl w-fit">
      {/* Currículo */}
      <Link
        href={`/admin/candidatos/${candidateId}`}
        className={`${base} ${!isFicha ? active : inactive}`}
      >
        <FileText className="w-4 h-4" />
        Currículo
      </Link>

      {/* Exportar PDF */}
      <Link
        href={printUrl}
        target="_blank"
        className={`${base} ${inactive}`}
      >
        <FileDown className="w-4 h-4" />
        Exportar PDF
      </Link>

      {/* Ficha Admissão */}
      <Link
        href={`/admin/candidatos/${candidateId}/ficha-admissao`}
        className={`${base} ${isFicha ? active : inactive}`}
      >
        <ClipboardList className="w-4 h-4" />
        Ficha Admissão
      </Link>
    </div>
  )
}
