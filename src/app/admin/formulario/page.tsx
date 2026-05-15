import { createSupabaseServerClient } from '@/lib/supabase-server'
import { FormQuestionsManager } from './form-questions-manager'

export default async function FormularioPage() {
  const supabase = await createSupabaseServerClient()
  const { data: questions } = await supabase
    .from('form_questions')
    .select('*')
    .order('sort_order')

  return <FormQuestionsManager questions={questions || []} />
}
