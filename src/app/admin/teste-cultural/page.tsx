import { requirePermission } from '@/lib/auth-guard'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { CultureQuestionsManager } from './culture-questions-manager'

export default async function TesteCulturalPage() {
  await requirePermission('curriculos.teste_cultural')
  const supabase = await createSupabaseServerClient()
  const { data: questions } = await supabase
    .from('culture_questions')
    .select('*')
    .order('sort_order')

  return <CultureQuestionsManager questions={questions || []} />
}
