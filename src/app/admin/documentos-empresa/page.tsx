import { requirePermission } from '@/lib/auth-guard'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { DocumentosEmpresaManager } from './documentos-empresa-manager'

export const dynamic = 'force-dynamic'

export default async function DocumentosEmpresaPage() {
  await requirePermission('documentos_empresa')
  const supabase = await createSupabaseServiceClient()
  const [{ data: files }, { data: companiesData }] = await Promise.all([
    supabase.from('company_files').select('*').order('created_at', { ascending: false }),
    supabase.from('companies').select('apelido, razao_social').order('apelido'),
  ])

  const companyOptions = (companiesData || [])
    .map(c => c.apelido || c.razao_social || '')
    .filter(Boolean)

  return <DocumentosEmpresaManager files={files || []} companyOptions={companyOptions} />
}
