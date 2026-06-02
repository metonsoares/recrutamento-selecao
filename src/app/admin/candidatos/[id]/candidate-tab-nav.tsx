'use client'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { FileText, ClipboardList } from 'lucide-react'

interface Props {
  candidateId: string
}

export function CandidateTabNav({ candidateId }: Props) {
  const searchParams = useSearchParams()
  const activeTab = searchParams.get('tab') === 'ficha' ? 'ficha' : 'curriculo'

  const base = 'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all border'
  const active = 'bg-white border-gray-300 shadow-sm text-gray-900'
  const inactive = 'bg-transparent border-transparent text-gray-500 hover:text-gray-800 hover:bg-white/60'

  return (
    <div className="flex items-center gap-2 p-1 bg-gray-100/80 rounded-xl w-fit">
      <Link
        href={`/admin/candidatos/${candidateId}`}
        className={`${base} ${activeTab === 'curriculo' ? active : inactive}`}
      >
        <FileText className="w-4 h-4" />
        Currículo
      </Link>
      <Link
        href={`/admin/candidatos/${candidateId}?tab=ficha`}
        className={`${base} ${activeTab === 'ficha' ? active : inactive}`}
      >
        <ClipboardList className="w-4 h-4" />
        Ficha Admissão
      </Link>
    </div>
  )
}
