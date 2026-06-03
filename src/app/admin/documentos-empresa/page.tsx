import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { DocumentosEmpresaManager } from './documentos-empresa-manager'

export const dynamic = 'force-dynamic'

export default async function DocumentosEmpresaPage() {
  const supabase = await createSupabaseServiceClient()
  const { data } = await supabase
    .from('company_files')
    .select('*')
    .order('created_at', { ascending: false })

  return <DocumentosEmpresaManager files={data || []} />
}
