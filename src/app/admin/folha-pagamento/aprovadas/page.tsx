import { requireMaster } from '@/lib/auth-guard'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { AprovadasClient, PeriodoAprovado, EmpresaAprovada, ItemAprovado } from './aprovadas-client'

export const dynamic = 'force-dynamic'

/**
 * Folhas aprovadas — o que já foi fechado, período a período, listando SÓ as
 * empresas que tiveram folha aprovada naquele mês.
 *
 * O que aparece aqui é o retrato guardado na aprovação (fechamento_itens), não
 * a consolidação de agora: a folha aprovada tem que continuar mostrando os
 * números que foram aprovados, mesmo que um lançamento mude depois.
 */
export default async function FolhasAprovadasPage() {
  await requireMaster()
  const supabase = await createSupabaseServiceClient()

  const { data: ciclos } = await supabase
    .from('fechamento_ciclos')
    .select('id, competencia, empresa_id, empresa_nome, colaboradores, total_dias, total_faltas, total_gorjeta, total_salario, aprovado_por, aprovado_em')
    .order('competencia', { ascending: false })

  const lista = ciclos ?? []
  const cicloIds = lista.map(c => c.id as string)

  // Consultas simples e cruzamento em memória: embeds !inner do PostgREST já
  // falharam silenciosamente neste projeto.
  const { data: itens } = cicloIds.length
    ? await supabase.from('fechamento_itens')
        .select('ciclo_id, candidate_id, nome, cargo, vinculo, dias_trabalhados, faltas, vale_transporte, mensalidade_sindical, gorjeta, cargo_confianca, insalubridade_20, quebra_caixa_15, salario, comentario')
        .in('ciclo_id', cicloIds)
    : { data: [] as Record<string, unknown>[] }

  const itensPorCiclo = new Map<string, ItemAprovado[]>()
  for (const i of itens ?? []) {
    const arr = itensPorCiclo.get(i.ciclo_id as string) ?? []
    arr.push({
      candidate_id: i.candidate_id as string,
      nome: i.nome as string,
      cargo: (i.cargo as string) ?? null,
      vinculo: i.vinculo === 'intermitente' ? 'intermitente' : 'contratado',
      dias_trabalhados: Number(i.dias_trabalhados) || 0,
      faltas: Number(i.faltas) || 0,
      vale_transporte: (i.vale_transporte as boolean | null) ?? null,
      mensalidade_sindical: (i.mensalidade_sindical as boolean | null) ?? null,
      gorjeta: Number(i.gorjeta) || 0,
      cargo_confianca: (i.cargo_confianca as boolean | null) ?? null,
      insalubridade_20: (i.insalubridade_20 as boolean | null) ?? null,
      quebra_caixa_15: (i.quebra_caixa_15 as boolean | null) ?? null,
      salario: (i.salario as string) ?? null,
      comentario: (i.comentario as string) ?? '',
    })
    itensPorCiclo.set(i.ciclo_id as string, arr)
  }
  for (const arr of itensPorCiclo.values()) arr.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  // Outras aprovações do mesmo mês, para o cabeçalho dizer o que mais fechou.
  const [{ data: lancamentos }, { data: vt }, { data: gorjetas }, { data: premio }] = await Promise.all([
    supabase.from('folha_ciclos').select('tipo, competencia'),
    supabase.from('vt_ciclos').select('competencia'),
    supabase.from('gorjeta_ciclos').select('competencia'),
    supabase.from('premio_caju_ciclos').select('competencia'),
  ])

  const outrasPorComp = new Map<string, string[]>()
  const juntar = (comp: string, nome: string) => {
    const arr = outrasPorComp.get(comp) ?? []
    if (!arr.includes(nome)) arr.push(nome)
    outrasPorComp.set(comp, arr)
  }
  for (const l of lancamentos ?? []) juntar(l.competencia as string, String(l.tipo).replace(/-/g, ' '))
  for (const v of vt ?? []) juntar(v.competencia as string, 'vale transporte')
  for (const g of gorjetas ?? []) juntar(g.competencia as string, 'gorjetas')
  for (const p of premio ?? []) juntar(p.competencia as string, 'prêmio caju')

  const porCompetencia = new Map<string, EmpresaAprovada[]>()
  for (const c of lista) {
    const comp = c.competencia as string
    const arr = porCompetencia.get(comp) ?? []
    arr.push({
      ciclo_id: c.id as string,
      empresa_id: (c.empresa_id as string) ?? null,
      empresa_nome: (c.empresa_nome as string) ?? 'Sem empresa',
      aprovado_por: (c.aprovado_por as string) ?? null,
      aprovado_em: c.aprovado_em as string,
      totais: {
        colaboradores: Number(c.colaboradores) || 0,
        total_dias: Number(c.total_dias) || 0,
        total_faltas: Number(c.total_faltas) || 0,
        total_gorjeta: Number(c.total_gorjeta) || 0,
        total_salario: Number(c.total_salario) || 0,
      },
      linhas: itensPorCiclo.get(c.id as string) ?? [],
    })
    porCompetencia.set(comp, arr)
  }

  const periodos: PeriodoAprovado[] = Array.from(porCompetencia.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([competencia, empresas]) => ({
      competencia,
      empresas: empresas.sort((a, b) => a.empresa_nome.localeCompare(b.empresa_nome, 'pt-BR')),
      outras: (outrasPorComp.get(competencia) ?? []).sort(),
    }))

  return <AprovadasClient periodos={periodos} />
}
