import { requirePermission } from '@/lib/auth-guard'
// Autorização = requirePermission('curriculos.secoes') abaixo; o client de
// serviço libera a remoção da policy ALL/authenticated/true de form_sections/form_questions.
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { SectionsManager } from './sections-manager'

export const dynamic = 'force-dynamic'

export default async function SecoesPage() {
  await requirePermission('curriculos.secoes')
  const supabase = await createSupabaseServiceClient()

  const [{ data: sections }, { data: questions }] = await Promise.all([
    supabase
      .from('form_sections')
      .select('*')
      .order('sort_order', { ascending: true }),
    supabase
      .from('form_questions')
      .select('*')
      .eq('form_type', 'registration')
      .order('sort_order', { ascending: true }),
  ])

  return <SectionsManager sections={sections ?? []} questions={questions ?? []} />
}
