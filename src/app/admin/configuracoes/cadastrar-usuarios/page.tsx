import { requirePermission } from '@/lib/auth-guard'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { CadastrarUsuariosManager } from './cadastrar-usuarios-manager'

export const dynamic = 'force-dynamic'

export default async function CadastrarUsuariosPage() {
  await requirePermission('config.usuarios_cadastro')
  const service = await createSupabaseServiceClient()

  // Usuários do sistema já cadastrados (com code no metadata)
  const { data: usersData } = await service.auth.admin.listUsers({ perPage: 1000 })
  const systemUsers = (usersData?.users ?? [])
    .filter(u => u.user_metadata?.code)
    .map(u => ({
      id: u.id,
      email: u.email ?? '',
      name: (u.user_metadata?.full_name as string | undefined) ?? '',
      code: (u.user_metadata?.code as string | undefined) ?? '',
      empresa: (u.user_metadata?.empresa as string | undefined) ?? '',
      perfil: (u.user_metadata?.perfil as string | undefined) ?? 'operador',
      candidate_id: (u.user_metadata?.candidate_id as string | undefined) ?? '',
    }))
  const registeredCandidateIds = new Set(systemUsers.map(u => u.candidate_id).filter(Boolean))

  // Colaboradores elegíveis: status contratado / aprovado (intermitente) / freelancer
  const { data: candidates } = await service
    .from('candidates')
    .select(`
      id, full_name, email, cpf,
      applications!latest_application_id ( status, admission_form )
    `)
    .is('deleted_at', null)
    .order('full_name', { ascending: true })

  // Empresas (id → apelido/razão)
  const { data: companiesData } = await service.from('companies').select('id, apelido, razao_social')
  const companyMap: Record<string, string> = {}
  for (const c of companiesData || []) companyMap[c.id] = c.apelido || c.razao_social || 'Empresa'

  type AppLite = { status?: string; admission_form?: { selected_company_id?: string } | null }
  const ELIGIBLE = ['contratado', 'aprovado', 'freelancer']

  const eligible = (candidates || [])
    .map(c => {
      const app = (Array.isArray(c.applications) ? c.applications[0] : c.applications) as AppLite | null
      return { c, app }
    })
    .filter(({ c, app }) => app?.status && ELIGIBLE.includes(app.status) && !registeredCandidateIds.has(c.id))
    .map(({ c, app }) => {
      const companyId = app?.admission_form?.selected_company_id
      return {
        id: c.id as string,
        full_name: c.full_name as string,
        email: (c.email as string | null) ?? '',
        cpf: (c.cpf as string | null) ?? '',
        empresa: companyId ? (companyMap[companyId] ?? '') : '',
      }
    })

  // Empresas com colaboradores elegíveis (para o dropdown)
  const companyOptions = Array.from(
    new Set(eligible.map(e => e.empresa).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  return <CadastrarUsuariosManager systemUsers={systemUsers} eligible={eligible} companyOptions={companyOptions} />
}
