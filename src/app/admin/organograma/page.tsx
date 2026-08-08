import { requirePermission } from '@/lib/auth-guard'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { getGrantedPerms } from '@/lib/permissions-server'
import { OrganogramaClient, Unidade, No, ColaboradorOpcao } from './organograma-client'

export const dynamic = 'force-dynamic'

/** Respostas de formulário são gravadas como JSON.stringify(valor). */
function parseTexto(v: string | null): string | null {
  if (!v) return null
  try {
    const p = JSON.parse(v)
    return typeof p === 'string' ? p : null
  } catch { return v }
}

export default async function OrganogramaPage() {
  const role = await requirePermission('organograma.ver')
  const granted = await getGrantedPerms(role)
  const podeEditar = granted.has('organograma.editar')

  const supabase = await createSupabaseServiceClient()

  // Consultas simples (sem join embutido — o embed candidates!inner não retornava).
  const [{ data: unidades }, { data: nos }, { data: apps }] = await Promise.all([
    supabase.from('org_unidades').select('*').eq('ativo', true).order('ordem'),
    supabase.from('org_nos').select('*').eq('ativo', true).order('ordem'),
    supabase
      .from('applications')
      .select('id, candidate_id, admission_form')
      .eq('is_latest', true)
      .in('status', ['contratado', 'em_contrato']),
  ])

  const appsAtivos = apps ?? []
  const candIds = appsAtivos.map(a => a.candidate_id as string).filter(Boolean)
  const appIds = appsAtivos.map(a => a.id as string)

  const [{ data: cands }, { data: fotoQ }] = await Promise.all([
    candIds.length
      ? supabase.from('candidates').select('id, full_name, deleted_at').in('id', candIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string; deleted_at: string | null }[] }),
    supabase.from('form_questions').select('id').eq('field_type', 'file_upload'),
  ])

  // Foto do colaborador: resposta do formulário do tipo upload de arquivo.
  const fotoQIds = (fotoQ ?? []).map(q => q.id as string)
  const { data: fotoAns } = fotoQIds.length && appIds.length
    ? await supabase
        .from('form_answers')
        .select('application_id, answer_text')
        .in('question_id', fotoQIds)
        .in('application_id', appIds)
    : { data: [] as { application_id: string; answer_text: string | null }[] }

  const fotoPorApp = new Map<string, string>()
  for (const a of fotoAns ?? []) {
    const url = parseTexto(a.answer_text as string | null)
    if (url && /^https?:\/\//.test(url)) fotoPorApp.set(a.application_id as string, url)
  }

  const candPorId = new Map((cands ?? []).map(c => [c.id as string, c]))

  // Colaboradores ativos. Quem foi desligado sai do organograma automaticamente
  // (a rota de status remove o nó); este filtro é a rede de segurança.
  const colaboradores: ColaboradorOpcao[] = appsAtivos
    .map(a => {
      const c = candPorId.get(a.candidate_id as string)
      if (!c || c.deleted_at) return null
      const af = a.admission_form as Record<string, unknown> | null
      return {
        candidate_id: a.candidate_id as string,
        nome: c.full_name,
        cargo: String(af?.function_title ?? '').trim() || null,
        company_id: String(af?.selected_company_id ?? '') || null,
        foto_url: fotoPorApp.get(a.id as string) ?? null,
      }
    })
    .filter(Boolean) as ColaboradorOpcao[]

  const ativos = new Set(colaboradores.map(c => c.candidate_id))
  const nosVisiveis = (nos ?? []).filter(n => !n.candidate_id || ativos.has(n.candidate_id as string))

  // Foto por nó (para os cards dentro das caixas).
  const fotoPorCandidato: Record<string, string> = {}
  for (const c of colaboradores) if (c.foto_url) fotoPorCandidato[c.candidate_id] = c.foto_url

  return (
    <OrganogramaClient
      unidades={(unidades ?? []) as Unidade[]}
      nos={nosVisiveis as No[]}
      colaboradores={colaboradores.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))}
      fotos={fotoPorCandidato}
      podeEditar={podeEditar}
    />
  )
}
