import { requirePermission } from '@/lib/auth-guard'
// Autorização = requirePermission('curriculos.teste_cultural') abaixo; o client
// de serviço libera a remoção da policy ALL/authenticated/true de culture_questions.
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { CultureQuestionsManager } from './culture-questions-manager'

export default async function TesteCulturalPage() {
  await requirePermission('curriculos.teste_cultural')
  const supabase = await createSupabaseServiceClient()
  const { data: questions } = await supabase
    .from('culture_questions')
    .select('*')
    .order('sort_order')

  return <CultureQuestionsManager questions={questions || []} />
}
