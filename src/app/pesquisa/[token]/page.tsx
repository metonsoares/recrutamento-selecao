import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { PesquisaForm } from './pesquisa-form'

export const dynamic = 'force-dynamic'

interface QuestionOption { text: string; weight: number }
interface Question { id: string; text: string; options: QuestionOption[] }

export default async function PesquisaPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ c?: string }> }) {
  const { token } = await params
  const { c: lockedId } = await searchParams
  const supabase = await createSupabaseServiceClient()
  const { data: survey } = await supabase
    .from('climate_surveys')
    .select('id, title, description, questions, active, company_name, target_candidate_ids')
    .eq('token', token)
    .maybeSingle()

  if (!survey || !survey.active) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6 text-center">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pesquisa indisponível</h1>
          <p className="text-sm text-muted-foreground mt-1">Este link de pesquisa não está mais ativo.</p>
        </div>
      </div>
    )
  }

  // Funcionário pré-identificado via link da ficha (?c=candidateId)
  let lockedCandidate: { id: string; full_name: string } | null = null
  if (lockedId) {
    const { data } = await supabase.from('candidates').select('id, full_name').eq('id', lockedId).maybeSingle()
    if (data) lockedCandidate = data as { id: string; full_name: string }
  }

  // Funcionários do grupo (para identificar quem está respondendo)
  const ids = (survey.target_candidate_ids as string[]) || []
  let funcionarios: { id: string; full_name: string }[] = []
  if (!lockedCandidate && ids.length > 0) {
    const { data } = await supabase.from('candidates').select('id, full_name').in('id', ids)
    funcionarios = (data || []) as { id: string; full_name: string }[]
  }

  return (
    <PesquisaForm
      token={token}
      title={survey.title}
      description={survey.description}
      companyName={survey.company_name}
      questions={(survey.questions as Question[]) || []}
      funcionarios={funcionarios}
      lockedCandidate={lockedCandidate}
    />
  )
}
