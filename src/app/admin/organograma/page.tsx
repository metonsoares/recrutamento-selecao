import { requirePermission } from '@/lib/auth-guard'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { getGrantedPerms } from '@/lib/permissions-server'
import { OrganogramaClient, Unidade, No, ColaboradorOpcao } from './organograma-client'

export const dynamic = 'force-dynamic'

export default async function OrganogramaPage() {
  const role = await requirePermission('organograma.ver')
  const granted = await getGrantedPerms(role)
  const podeEditar = granted.has('organograma.editar')

  const supabase = await createSupabaseServiceClient()

  const [{ data: unidades }, { data: nos }, { data: apps }] = await Promise.all([
    supabase.from('org_unidades').select('*').eq('ativo', true).order('ordem'),
    supabase.from('org_nos').select('*').eq('ativo', true).order('ordem'),
    supabase
      .from('applications')
      .select('candidate_id, admission_form, candidates!inner(full_name, deleted_at)')
      .eq('is_latest', true)
      .in('status', ['contratado', 'em_contrato']),
  ])

  // Colaboradores ativos (contratado / em contrato). Quem foi desligado sai do
  // organograma automaticamente — a rota de status remove o nó, e este filtro
  // garante que nada apareça mesmo se algum registro antigo tiver sobrado.
  const ativos = new Set(
    (apps ?? [])
      .filter(a => {
        const c = a.candidates as unknown as { deleted_at: string | null } | null
        return c && !c.deleted_at
      })
      .map(a => a.candidate_id as string),
  )
  const nosVisiveis = (nos ?? []).filter(n => !n.candidate_id || ativos.has(n.candidate_id as string))

  // Colaboradores contratados que ainda não estão no organograma.
  const jaNoOrg = new Set(nosVisiveis.map(n => n.candidate_id).filter(Boolean) as string[])
  const disponiveis: ColaboradorOpcao[] = (apps ?? [])
    .filter(a => {
      const c = a.candidates as unknown as { full_name: string; deleted_at: string | null } | null
      return c && !c.deleted_at && !jaNoOrg.has(a.candidate_id as string)
    })
    .map(a => {
      const c = a.candidates as unknown as { full_name: string }
      const af = a.admission_form as Record<string, unknown> | null
      return {
        candidate_id: a.candidate_id as string,
        nome: c.full_name,
        cargo: String(af?.function_title ?? '').trim() || null,
        company_id: String(af?.selected_company_id ?? '') || null,
      }
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  return (
    <OrganogramaClient
      unidades={(unidades ?? []) as Unidade[]}
      nos={nosVisiveis as No[]}
      disponiveis={disponiveis}
      podeEditar={podeEditar}
    />
  )
}
