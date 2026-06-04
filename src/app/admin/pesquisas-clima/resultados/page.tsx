import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { ResultadosManager } from './resultados-manager'

export const dynamic = 'force-dynamic'

export default async function ResultadosPage() {
  const supabase = await createSupabaseServiceClient()
  const { data: surveys } = await supabase
    .from('climate_surveys')
    .select('id, title, company_name, climate_responses(count)')
    .order('created_at', { ascending: false })

  return <ResultadosManager surveys={(surveys || []) as unknown as never[]} />
}
