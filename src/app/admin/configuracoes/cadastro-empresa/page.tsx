import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { CompaniesManager } from './companies-manager'

export const dynamic = 'force-dynamic'

export default async function CadastroEmpresaPage() {
  const supabase = await createSupabaseServiceClient()
  const { data } = await supabase
    .from('companies')
    .select('*')
    .order('created_at', { ascending: false })

  return <CompaniesManager companies={data || []} />
}
