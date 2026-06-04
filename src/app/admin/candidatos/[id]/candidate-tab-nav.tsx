'use client'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { FileText, ClipboardList, FolderArchive, AlertTriangle, Landmark, Plane, Stethoscope, FileSignature, Wallet, CalendarDays } from 'lucide-react'

interface Props {
  candidateId: string
  /** Renomeia a 1ª aba para "Resumo" (colaboradores) */
  showResumo?: boolean
  /** Exibe Dados Bancários — contratado, freelancer, intermitente */
  showBankTab?: boolean
  /** Exibe Férias — apenas contratado */
  showVacationTab?: boolean
  /** Exibe Ficha Admissão — contratado e intermitente */
  showFicha?: boolean
  /** Exibe Dados para contrato — em contrato */
  showContract?: boolean
  /** Exibe Documentos — contratado, intermitente, em contrato */
  showDocumentos?: boolean
  /** Exibe Advertências e Atestados — apenas contratado */
  showRecords?: boolean
  /** Exibe Contracheques e Folhas de ponto — contratado e intermitente */
  showPayroll?: boolean
}

export function CandidateTabNav({ candidateId, showResumo = false, showBankTab = false, showVacationTab = false, showFicha = true, showContract = false, showDocumentos = true, showRecords = true, showPayroll = false }: Props) {
  const searchParams = useSearchParams()
  const tab = searchParams.get('tab')
  const activeTab =
    tab === 'ficha' ? 'ficha'
    : tab === 'contrato' ? 'contrato'
    : tab === 'documentos' ? 'documentos'
    : tab === 'advertencias' ? 'advertencias'
    : tab === 'bancarios' ? 'bancarios'
    : tab === 'ferias' ? 'ferias'
    : tab === 'atestados' ? 'atestados'
    : tab === 'contracheques' ? 'contracheques'
    : tab === 'folhas-ponto' ? 'folhas-ponto'
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
        {showResumo ? 'Resumo' : 'Currículo'}
      </Link>
      {showFicha && (
        <Link
          href={`/admin/candidatos/${candidateId}?tab=ficha`}
          className={`${base} ${activeTab === 'ficha' ? active : inactive}`}
        >
          <ClipboardList className="w-4 h-4" />
          Ficha Admissão
        </Link>
      )}
      {showContract && (
        <Link
          href={`/admin/candidatos/${candidateId}?tab=contrato`}
          className={`${base} ${activeTab === 'contrato' ? active : inactive}`}
        >
          <FileSignature className="w-4 h-4" />
          Dados para contrato
        </Link>
      )}
      {showDocumentos && (
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
      {showRecords && (
        <Link
          href={`/admin/candidatos/${candidateId}?tab=advertencias`}
          className={`${base} ${activeTab === 'advertencias' ? active : inactive}`}
        >
          <AlertTriangle className="w-4 h-4" />
          Advertências
        </Link>
      )}
      {showRecords && (
        <Link
          href={`/admin/candidatos/${candidateId}?tab=atestados`}
          className={`${base} ${activeTab === 'atestados' ? active : inactive}`}
        >
          <Stethoscope className="w-4 h-4" />
          Atestados
        </Link>
      )}
      {showPayroll && (
        <Link
          href={`/admin/candidatos/${candidateId}?tab=contracheques`}
          className={`${base} ${activeTab === 'contracheques' ? active : inactive}`}
        >
          <Wallet className="w-4 h-4" />
          Contracheques
        </Link>
      )}
      {showPayroll && (
        <Link
          href={`/admin/candidatos/${candidateId}?tab=folhas-ponto`}
          className={`${base} ${activeTab === 'folhas-ponto' ? active : inactive}`}
        >
          <CalendarDays className="w-4 h-4" />
          Folhas de ponto
        </Link>
      )}
    </div>
  )
}
