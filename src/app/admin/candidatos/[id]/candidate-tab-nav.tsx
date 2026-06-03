'use client'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { FileText, ClipboardList, FolderArchive, AlertTriangle, Landmark, Plane, Stethoscope } from 'lucide-react'

interface Props {
  candidateId: string
  /** Exibe Dados Bancários — contratado, freelancer, intermitente */
  showBankTab?: boolean
  /** Exibe Férias — contratado e intermitente (não freelancer) */
  showVacationTab?: boolean
  /** Exibe Ficha Admissão, Documentos e Advertências — apenas contratado */
  showAdmissionTabs?: boolean
}

export function CandidateTabNav({ candidateId, showBankTab = false, showVacationTab = false, showAdmissionTabs = true }: Props) {
  const searchParams = useSearchParams()
  const tab = searchParams.get('tab')
  const activeTab =
    tab === 'ficha' ? 'ficha'
    : tab === 'documentos' ? 'documentos'
    : tab === 'advertencias' ? 'advertencias'
    : tab === 'bancarios' ? 'bancarios'
    : tab === 'ferias' ? 'ferias'
    : tab === 'atestados' ? 'atestados'
    : 'curriculo'

  const base = 'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all border'
  const active = 'bg-white border-gray-300 shadow-sm text-gray-900'
  const inactive = 'bg-transparent border-transparent text-gray-500 hover:text-gray-800 hover:bg-white/60'

  return (
    <div className="flex items-center gap-2 p-1 bg-gray-100/80 rounded-xl w-fit flex-wrap">
      <Link
        href={`/admin/candidatos/${candidateId}`}
        className={`${base} ${activeTab === 'curriculo' ? active : inactive}`}
      >
        <FileText className="w-4 h-4" />
        {showBankTab ? 'Resumo' : 'Currículo'}
      </Link>
      {showAdmissionTabs && (
        <Link
          href={`/admin/candidatos/${candidateId}?tab=ficha`}
          className={`${base} ${activeTab === 'ficha' ? active : inactive}`}
        >
          <ClipboardList className="w-4 h-4" />
          Ficha Admissão
        </Link>
      )}
      {showAdmissionTabs && (
        <Link
          href={`/admin/candidatos/${candidateId}?tab=documentos`}
          className={`${base} ${activeTab === 'documentos' ? active : inactive}`}
        >
          <FolderArchive className="w-4 h-4" />
          Documentos
        </Link>
      )}
      {showBankTab && (
        <Link
          href={`/admin/candidatos/${candidateId}?tab=bancarios`}
          className={`${base} ${activeTab === 'bancarios' ? active : inactive}`}
        >
          <Landmark className="w-4 h-4" />
          Dados Bancários
        </Link>
      )}
      {showVacationTab && (
        <Link
          href={`/admin/candidatos/${candidateId}?tab=ferias`}
          className={`${base} ${activeTab === 'ferias' ? active : inactive}`}
        >
          <Plane className="w-4 h-4" />
          Férias
        </Link>
      )}
      {showAdmissionTabs && (
        <Link
          href={`/admin/candidatos/${candidateId}?tab=advertencias`}
          className={`${base} ${activeTab === 'advertencias' ? active : inactive}`}
        >
          <AlertTriangle className="w-4 h-4" />
          Advertências
        </Link>
      )}
      {showAdmissionTabs && (
        <Link
          href={`/admin/candidatos/${candidateId}?tab=atestados`}
          className={`${base} ${activeTab === 'atestados' ? active : inactive}`}
        >
          <Stethoscope className="w-4 h-4" />
          Atestados
        </Link>
      )}
    </div>
  )
}
