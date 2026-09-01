import { requireMaster } from '@/lib/auth-guard'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { fichaDaCompetencia } from '@/lib/ficha-competencia'
import { PremioCajuClient, LinhaCaju, EmpresaOpcao, PagamentoHistorico } from './premio-caju-client'

export const dynamic = 'force-dynamic'

/** Competência (yyyy-mm-01) do mês fechado anterior, no fuso de São Paulo. */
function competenciaPadrao(): string {
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const d = new Date(agora.getFullYear(), agora.getMonth() - 1, 1) // mês fechado anterior
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/**
 * Fim do período de experiência: data de admissão + a soma dos dias do
 * contrato ("45 + 45 dias" → 90). "Sem experiência" não tem número → 0.
 */
function fimDaExperiencia(admissao: string | null, contrato: string | null): string | null {
  if (!admissao || !/^\d{4}-\d{2}-\d{2}$/.test(admissao)) return null
  const dias = (contrato?.match(/\d+/g) ?? []).reduce((s, n) => s + Number(n), 0)
  if (dias <= 0) return null
  const [ano, mes, dia] = admissao.split('-').map(Number)
  const d = new Date(ano, mes - 1, dia + dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Último dia do mês da competência (yyyy-mm-dd). */
function fimDoMes(competencia: string): string {
  const [ano, mes] = competencia.split('-').map(Number)
  const ultimo = new Date(ano, mes, 0).getDate()
  return `${ano}-${String(mes).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`
}

export default async function PremioCajuPage({
  searchParams,
}: {
  searchParams: Promise<{ competencia?: string }>
}) {
  await requireMaster()
  const sp = await searchParams

  const competencia = /^\d{4}-\d{2}-01$/.test(sp.competencia ?? '')
    ? (sp.competencia as string)
    : competenciaPadrao()
  const inicio = competencia
  const fim = fimDoMes(competencia)

  const supabase = await createSupabaseServiceClient()

  const [{ data: apps }, { data: empresas }, { data: ciclo }] = await Promise.all([
    supabase
      .from('applications')
      .select('candidate_id, admission_form, admission_form_history, company_docs')
      .eq('is_latest', true)
      .eq('status', 'contratado'),
    supabase.from('companies').select('id, apelido, razao_social').order('apelido'),
    supabase.from('premio_caju_ciclos').select('*').eq('competencia', competencia).maybeSingle(),
  ])

  const appsList = apps ?? []
  const candIds = appsList.map(a => a.candidate_id as string).filter(Boolean)

  const [{ data: cands }, { data: faltas }, { data: advertencias }] = await Promise.all([
    candIds.length
      ? supabase.from('candidates').select('id, full_name, cpf, deleted_at').in('id', candIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string; cpf: string | null; deleted_at: string | null }[] }),
    // Faltas injustificadas do mês fechado (afastamento/atestado não tiram o prêmio).
    supabase.from('absences').select('candidate_id, absence_date, days')
      .eq('kind', 'injustificada').gte('absence_date', inicio).lte('absence_date', fim),
    supabase.from('warnings').select('candidate_id, occurred_at')
      .gte('occurred_at', inicio).lte('occurred_at', fim),
  ])

  // Histórico de pagamentos aprovados (mês + valor por pessoa).
  // Consultas simples e cruzamento em memória — o embed do PostgREST
  // (premio_caju_ciclos!inner) voltava vazio e o histórico nunca aparecia.
  const [{ data: todosCiclos }, { data: todosItens }] = await Promise.all([
    supabase.from('premio_caju_ciclos').select('id, competencia'),
    supabase.from('premio_caju_itens').select('ciclo_id, candidate_id, nome, cargo, empresa_id, empresa_nome, valor'),
  ])
  const competenciaPorCiclo = new Map((todosCiclos ?? []).map(c => [c.id as string, c.competencia as string]))
  // Meses já fechados, do mais recente para o mais antigo (seletor de exportação).
  const competenciasAprovadas = Array.from(competenciaPorCiclo.values()).sort().reverse()

  const candPorId = new Map((cands ?? []).map(c => [c.id as string, c]))
  const empresaPorId = new Map(
    (empresas ?? []).map(e => [e.id as string, (e.apelido as string) || (e.razao_social as string) || '—']),
  )

  const faltasPorCand = new Map<string, number>()
  for (const f of faltas ?? []) {
    const k = f.candidate_id as string
    faltasPorCand.set(k, (faltasPorCand.get(k) ?? 0) + (Number(f.days) || 1))
  }
  const advPorCand = new Map<string, number>()
  for (const a of advertencias ?? []) {
    const k = a.candidate_id as string
    advPorCand.set(k, (advPorCand.get(k) ?? 0) + 1)
  }
  // CPF só com dígitos — a exportação CSV do pedido de premiação exige assim.
  const cpfs: Record<string, string> = {}
  for (const c of cands ?? []) {
    const digitos = String(c.cpf ?? '').replace(/\D/g, '')
    if (digitos.length === 11) cpfs[c.id as string] = digitos
  }

  // Guarda o snapshot da aprovação (nome/cargo/empresa da época) — exportar um
  // mês passado tem de refletir o que foi aprovado, não o cadastro de hoje.
  const historico: PagamentoHistorico[] = (todosItens ?? [])
    .map(h => {
      const comp = competenciaPorCiclo.get(h.ciclo_id as string)
      if (!comp) return null
      return {
        candidate_id: h.candidate_id as string,
        competencia: comp,
        valor: Number(h.valor),
        nome: (h.nome as string) ?? '',
        cargo: (h.cargo as string) ?? null,
        empresa_id: (h.empresa_id as string) ?? null,
        empresa_nome: (h.empresa_nome as string) ?? null,
      }
    })
    .filter(Boolean) as PagamentoHistorico[]

  const linhas: LinhaCaju[] = appsList
    .map(a => {
      const c = candPorId.get(a.candidate_id as string)
      if (!c || c.deleted_at) return null

      const docs = a.company_docs as Record<string, unknown> | null
      const caju = docs?.premio_caju as { not_applicable?: boolean } | undefined
      if (caju?.not_applicable === true) return null // "Não aplicável" fica fora

      // A ficha do MÊS, não a de hoje: quem foi transferido de empresa tem
      // ficha nova (empresa nova, admissão nova) e sumiria dos meses anteriores.
      const af = fichaDaCompetencia(a, fim)

      // "Recebe prêmio Caju?" respondido NÃO na ficha tira da lista. Só o não
      // explícito exclui: ficha ainda sem resposta (null) continua entrando,
      // senão a pergunta nova esvaziaria a tela de uma vez.
      const recebeCaju = af?.premio_caju
      if (recebeCaju === false || recebeCaju === 'false') return null

      const empresaId = String(af?.selected_company_id ?? '')
      const id = a.candidate_id as string
      const dias = faltasPorCand.get(id) ?? 0
      const adv = advPorCand.get(id) ?? 0

      // Em experiência = ainda estava no período no ÚLTIMO DIA da competência.
      // Quem terminou a experiência ao longo do mês já recebe o prêmio.
      const admissao = String(af?.admission_date ?? '') || null
      const fimExp = fimDaExperiencia(admissao, String(af?.trial_contract ?? '') || null)
      const emExperiencia = fimExp !== null && fimExp >= fim

      return {
        candidate_id: id,
        nome: c.full_name,
        cargo: String(af?.function_title ?? '').trim() || null,
        empresa_id: empresaId || null,
        empresa: empresaPorId.get(empresaId) ?? null,
        faltas: dias,
        advertencias: adv,
        em_experiencia: emExperiencia,
        fim_experiencia: fimExp,
        sem_data_admissao: !admissao,
        elegivel: dias === 0 && adv === 0 && !emExperiencia,
      }
    })
    .filter(Boolean) as LinhaCaju[]

  linhas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  const opcoesEmpresa: EmpresaOpcao[] = Array.from(
    new Map(linhas.filter(l => l.empresa_id).map(l => [l.empresa_id as string, l.empresa ?? '—'])).entries(),
  ).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  return (
    <PremioCajuClient
      competencia={competencia}
      linhas={linhas}
      empresas={opcoesEmpresa}
      historico={historico}
      competenciasAprovadas={competenciasAprovadas}
      cpfs={cpfs}
      cicloAprovado={ciclo ? {
        valor_padrao: Number(ciclo.valor_padrao),
        total: Number(ciclo.total),
        aprovado_por: (ciclo.aprovado_por as string) ?? null,
        aprovado_em: ciclo.aprovado_em as string,
      } : null}
    />
  )
}
