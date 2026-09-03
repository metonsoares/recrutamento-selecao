import { requireMaster } from '@/lib/auth-guard'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { mesCorrente, competenciaValida } from '@/lib/competencia'
import { AprovadasClient, EmpresaAprovada, ItemAprovado } from './aprovadas-client'

export const dynamic = 'force-dynamic'

/**
 * Folhas aprovadas — o mês escolhido na navegação, listando SÓ as empresas que
 * tiveram folha aprovada nele.
 *
 * O que aparece aqui é o retrato guardado na aprovação (fechamento_itens), não
 * a consolidação de agora: a folha aprovada tem que continuar mostrando os
 * números que foram aprovados, mesmo que um lançamento mude depois.
 */
export default async function FolhasAprovadasPage({
  searchParams,
}: {
  searchParams: Promise<{ competencia?: string }>
}) {
  await requireMaster()
  const sp = await searchParams
  const competencia = competenciaValida(sp.competencia) ? sp.competencia : mesCorrente()
  const supabase = await createSupabaseServiceClient()

  const { data: ciclos } = await supabase
    .from('fechamento_ciclos')
    .select('id, competencia, empresa_id, empresa_nome, colaboradores, total_dias, total_faltas, total_gorjeta, total_salario, aprovado_por, aprovado_em')
    .eq('competencia', competencia)

  const lista = ciclos ?? []
  const cicloIds = lista.map(c => c.id as string)

  // Consultas simples e cruzamento em memória: embeds !inner do PostgREST já
  // falharam silenciosamente neste projeto.
  const { data: itens } = cicloIds.length
    ? await supabase.from('fechamento_itens')
        .select('ciclo_id, candidate_id, nome, cargo, vinculo, dias_trabalhados, faltas, vale_transporte, mensalidade_sindical, gorjeta, cargo_confianca, insalubridade_20, quebra_caixa_15, salario, comentario, domingos, feriados, avarias, adiantamento, horas_normais, horas_50, horas_100, adicional_noturno, gratificacao, confianca_valor, quebra_valor, atrasos')
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
      domingos: Number(i.domingos) || 0,
      feriados: Number(i.feriados) || 0,
      avarias: Number(i.avarias) || 0,
      adiantamento: Number(i.adiantamento) || 0,
      horas_normais: Number(i.horas_normais) || 0,
      horas_50: Number(i.horas_50) || 0,
      horas_100: Number(i.horas_100) || 0,
      adicional_noturno: Number(i.adicional_noturno) || 0,
      gratificacao: Number(i.gratificacao) || 0,
      confianca_valor: Number(i.confianca_valor) || 0,
      quebra_valor: Number(i.quebra_valor) || 0,
      atrasos: Number(i.atrasos) || 0,
    })
    itensPorCiclo.set(i.ciclo_id as string, arr)
  }
  for (const arr of itensPorCiclo.values()) arr.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  // O que mais fechou no mesmo mês, para o cabeçalho dar o contexto.
  const [{ data: lancamentos }, { data: vt }, { data: gorjetas }, { data: premio }] = await Promise.all([
    supabase.from('folha_ciclos').select('tipo, aprovado_em').eq('competencia', competencia),
    supabase.from('vt_ciclos').select('aprovado_em').eq('competencia', competencia),
    supabase.from('gorjeta_ciclos').select('aprovado_em').eq('competencia', competencia),
    supabase.from('premio_caju_ciclos').select('aprovado_em').eq('competencia', competencia),
  ])

  const outras: string[] = []
  // Quando cada lançamento foi aprovado: se algum é mais novo que o retrato da
  // folha, aquele número não entrou nela — e é melhor a tela dizer isso.
  const lancamentosDoMes: { nome: string; aprovado_em: string }[] = []
  const anotar = (nome: string, aprovado_em: unknown) => {
    outras.push(nome)
    if (typeof aprovado_em === 'string') lancamentosDoMes.push({ nome, aprovado_em })
  }
  for (const l of lancamentos ?? []) anotar(String(l.tipo).replace(/-/g, ' '), l.aprovado_em)
  for (const v of vt ?? []) anotar('vale transporte', v.aprovado_em)
  for (const g of gorjetas ?? []) anotar('gorjetas', g.aprovado_em)
  for (const p of premio ?? []) anotar('prêmio caju', p.aprovado_em)
  outras.sort()

  const empresas: EmpresaAprovada[] = []
  for (const c of lista) {
    // Folha sem colaborador nenhum não é folha. Por construção não existe (o
    // POST apaga o ciclo quando ninguém fica marcado); isto só evita mostrar
    // um cartão vazio se sobrar algum registro antigo.
    const linhas = itensPorCiclo.get(c.id as string) ?? []
    if (linhas.length === 0) continue
    empresas.push({
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
      linhas,
    })
  }
  empresas.sort((a, b) => a.empresa_nome.localeCompare(b.empresa_nome, 'pt-BR'))

  return (
    <AprovadasClient competencia={competencia} empresas={empresas} outras={outras}
      lancamentosDoMes={lancamentosDoMes} />
  )
}
