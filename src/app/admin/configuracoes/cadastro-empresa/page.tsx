import { requirePermission } from '@/lib/auth-guard'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { CompaniesManager } from './companies-manager'

export const dynamic = 'force-dynamic'

export default async function CadastroEmpresaPage() {
  await requirePermission('config.empresa_cadastro')
  const supabase = await createSupabaseServiceClient()
  const { data } = await supabase
    .from('companies')
    .select('*')
    .order('created_at', { ascending: false })

  return <CompaniesManager companies={data || []} />
}
