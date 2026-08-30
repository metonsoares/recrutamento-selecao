import { requirePermission } from '@/lib/auth-guard'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { FolhasAnaliticasManager, FolhaAnalitica } from './folhas-analiticas-manager'

export const dynamic = 'force-dynamic'

const BUCKET = 'folhas-analiticas'

export default async function FolhasAnaliticasPage() {
  await requirePermission('documentos_empresa')

  const supabase = await createSupabaseServiceClient()

  const [{ data: folhas }, { data: companiesData }] = await Promise.all([
    supabase.from('folhas_analiticas').select('*').order('competencia', { ascending: false }),
    supabase.from('companies').select('apelido, razao_social').order('apelido'),
  ])

  const lista = folhas ?? []

  // O bucket é privado. A URL assinada é criada NO CLIQUE, não aqui: assinada
  // no render, ela vira um cronômetro contra o usuário (aba aberta um tempo, o
  // prazo vence e o link morre) e custa um round-trip ao Storage por linha.
  const assinadas = lista.map(f => ({
    id: f.id as string,
    empresa: f.empresa as string,
    competencia: f.competencia as string,
    file_name: f.file_name as string,
    path: f.file_path as string,
    created_at: f.created_at as string,
  })) as FolhaAnalitica[]

  const companyOptions = Array.from(new Set(
    (companiesData ?? [])
      .map(c => (c.apelido as string) || (c.razao_social as string) || '')
      .filter(Boolean),
  )).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  return <FolhasAnaliticasManager folhas={assinadas} companyOptions={companyOptions} />
}
