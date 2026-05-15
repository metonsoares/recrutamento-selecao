import { createSupabaseServerClient } from '@/lib/supabase-server'
import { FormQuestionsManager } from './form-questions-manager'

export default async function FormularioPage() {
  const supabase = await createSupabaseServerClient()
  const { data: questions } = await supabase
    .from('form_questions')
    .select('*')
    .in('form_type', ['experience', 'registration'])
    .order('sort_order')

  return <FormQuestionsManager questions={questions || []} />
}
