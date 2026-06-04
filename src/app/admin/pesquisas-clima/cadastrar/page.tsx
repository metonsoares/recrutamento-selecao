import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { CadastrarPesquisaManager } from './cadastrar-pesquisa-manager'

export const dynamic = 'force-dynamic'

export default async function CadastrarPesquisasPage() {
  const supabase = await createSupabaseServiceClient()

  const [{ data: surveys }, { data: companiesData }, { data: candidates }] = await Promise.all([
    supabase.from('climate_surveys').select('*, climate_responses(count)').order('created_at', { ascending: false }),
    supabase.from('companies').select('id, apelido, razao_social'),
    supabase.from('candidates').select(`
      id, full_name,
      applications!latest_application_id ( status, admission_form )
    `).is('deleted_at', null).order('full_name'),
  ])

  const companyMap: Record<string, string> = {}
  for (const c of companiesData || []) companyMap[c.id] = c.apelido || c.razao_social || 'Empresa'
  const companyOptions = Object.values(companyMap).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  type AppLite = { status?: string; admission_form?: { selected_company_id?: string } | null }
  const employees = (candidates || []).map(c => {
    const app = (Array.isArray(c.applications) ? c.applications[0] : c.applications) as AppLite | null
    const compId = app?.admission_form?.selected_company_id
    return {
      id: c.id as string,
      name: c.full_name as string,
      status: app?.status || 'novo',
      empresa: compId ? (companyMap[compId] ?? '') : '',
    }
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')

  return (
    <CadastrarPesquisaManager
      initialSurveys={(surveys || []) as unknown as never[]}
      companyOptions={companyOptions}
      employees={employees}
      appUrl={appUrl}
    />
  )
}
