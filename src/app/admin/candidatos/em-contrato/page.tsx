import { requirePermission } from '@/lib/auth-guard'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import Link from 'next/link'
import { ArrowLeft, Users, FileSignature } from 'lucide-react'
import { EmContratoTable } from './em-contrato-table'

export const dynamic = 'force-dynamic'

export default async function EmContratoPage() {
  await requirePermission('colaboradores.ver')
  const supabase = await createSupabaseServiceClient()

  const { data: candidates } = await supabase
    .from('candidates')
    .select(`
      id, full_name,
      applications!latest_application_id ( id, status, contract_data, admission_form )
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  type AppRow = {
    id: string
    status: string
    contract_data: { start_date?: string; end_date?: string; company_name?: string } | null
    admission_form: { selected_company_id?: string } | null
  }
  type CandidateRow = { id: string; full_name: string; applications: AppRow | AppRow[] | null }

  const rows = (candidates || []) as CandidateRow[]
  const getApp = (c: CandidateRow): AppRow | null =>
    !c.applications ? null : (Array.isArray(c.applications) ? c.applications[0] : c.applications)

  const lista = rows.filter(c => getApp(c)?.status === 'em_contrato')

  // Empresas (id → apelido/razão)
  const { data: companiesData } = await supabase.from('companies').select('id, apelido, razao_social')
  const companyMap: Record<string, string> = {}
  for (const c of companiesData || []) companyMap[c.id] = c.apelido || c.razao_social || 'Empresa'

  // Fotos
  const appIds = lista.map(c => getApp(c)?.id).filter(Boolean) as string[]
  const photoMap: Record<string, string> = {}
  if (appIds.length > 0) {
    const { data: fileQuestions } = await supabase.from('form_questions').select('id').eq('field_type', 'file_upload')
    const fileQuestionIds = (fileQuestions ?? []).map(q => q.id)
    if (fileQuestionIds.length > 0) {
      const { data: photoAnswers } = await supabase
        .from('form_answers').select('application_id, answer_text')
        .in('application_id', appIds).in('question_id', fileQuestionIds)
      for (const pa of photoAnswers || []) {
        if (!photoMap[pa.application_id] && pa.answer_text) {
          const url = pa.answer_text.replace(/^"|"$/g, '')
          if (url.startsWith('http')) photoMap[pa.application_id] = url
        }
      }
    }
  }

  const today = new Date(); today.setHours(0, 0, 0, 0)

  const tableRows = lista.map(c => {
    const app = getApp(c)
    const cd = app?.contract_data ?? null
    const companyId = app?.admission_form?.selected_company_id
    let diasRestantes: number | null = null
    if (cd?.end_date) {
      const end = new Date(cd.end_date + 'T00:00:00')
      diasRestantes = Math.round((end.getTime() - today.getTime()) / 86400000)
    }
    return {
      id: c.id,
      full_name: c.full_name,
      photoUrl: app ? (photoMap[app.id] ?? null) : null,
      empresa: cd?.company_name || (companyId ? (companyMap[companyId] ?? '') : ''),
      startDate: cd?.start_date ?? null,
      endDate: cd?.end_date ?? null,
      diasRestantes,
    }
  })

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/candidatos" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex items-center gap-2">
          <FileSignature className="w-6 h-6 text-teal-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Em contrato</h1>
            <p className="text-sm text-muted-foreground">
              {lista.length} candidato{lista.length !== 1 ? 's' : ''} em contrato
            </p>
          </div>
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
            <Users className="w-8 h-8 text-gray-300" />
          </div>
          <div>
            <p className="font-medium text-gray-600">Nenhum candidato em contrato</p>
            <p className="text-sm text-muted-foreground mt-1">Candidatos com status &ldquo;Em contrato&rdquo; aparecem aqui.</p>
          </div>
        </div>
      ) : (
        <EmContratoTable rows={tableRows} />
      )}
    </div>
  )
}
