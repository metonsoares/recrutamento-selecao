import { createSupabaseServerClient } from '@/lib/supabase-server'
import { SectionsManager } from './sections-manager'

export const dynamic = 'force-dynamic'

export default async function SecoesPage() {
  const supabase = await createSupabaseServerClient()
  const { data: sections } = await supabase
    .from('form_sections')
    .select('*')
    .order('sort_order', { ascending: true })

  return <SectionsManager sections={sections ?? []} />
}
