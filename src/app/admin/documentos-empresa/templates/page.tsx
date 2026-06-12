import { requirePermission } from '@/lib/auth-guard'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { TemplatesManager, ContractTemplate } from './templates-manager'

export const dynamic = 'force-dynamic'

export default async function TemplatesContratoPage() {
  await requirePermission('documentos_empresa')
  const supabase = await createSupabaseServiceClient()
  const [{ data: templates }, { data: companies }] = await Promise.all([
    supabase.from('contract_templates').select('*').order('created_at', { ascending: false }),
    supabase.from('companies').select('apelido, razao_social'),
  ])
  const companyOptions = (companies || [])
    .map(c => c.apelido || c.razao_social)
    .filter((v): v is string => !!v)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))

  return <TemplatesManager initialTemplates={(templates || []) as ContractTemplate[]} companyOptions={companyOptions} />
}
