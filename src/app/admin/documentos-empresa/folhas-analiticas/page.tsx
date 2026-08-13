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

  // Bucket é privado: o link de abertura é assinado e vale 1 hora.
  const assinadas = await Promise.all(
    lista.map(async f => {
      const { data } = await supabase.storage
        .from(BUCKET).createSignedUrl(f.file_path as string, 3600)
      return {
        id: f.id as string,
        empresa: f.empresa as string,
        competencia: f.competencia as string,
        file_name: f.file_name as string,
        url: data?.signedUrl ?? null,
        created_at: f.created_at as string,
      } as FolhaAnalitica
    }),
  )

  const companyOptions = Array.from(new Set(
    (companiesData ?? [])
      .map(c => (c.apelido as string) || (c.razao_social as string) || '')
      .filter(Boolean),
  )).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  return <FolhasAnaliticasManager folhas={assinadas} companyOptions={companyOptions} />
}
