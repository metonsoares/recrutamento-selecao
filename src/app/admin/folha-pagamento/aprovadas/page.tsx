import { requireMaster } from '@/lib/auth-guard'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { montarFechamento } from '@/lib/fechamento-folha'
import { AprovadasClient, PeriodoAprovado } from './aprovadas-client'

export const dynamic = 'force-dynamic'

/**
 * Folhas aprovadas — os meses já fechados, cada um com a MESMA tabela por
 * colaborador do Fechamento de folha. A montagem vem de lib/fechamento-folha,
 * compartilhada com aquela tela: duplicar a consolidação faria as duas
 * mostrarem números diferentes para o mesmo mês.
 */
export default async function FolhasAprovadasPage() {
  await requireMaster()
  const supabase = await createSupabaseServiceClient()

  const { data: fechamentos } = await supabase
    .from('fechamento_ciclos')
    .select('competencia, colaboradores, total_dias, total_faltas, total_gorjeta, total_salario, aprovado_por, aprovado_em')
    .order('competencia', { ascending: false })

  const lista = fechamentos ?? []

  // Outras aprovações do mesmo mês, para o cabeçalho do período dizer o que
  // mais foi fechado — sem repetir o detalhe, que já está na tabela.
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

  // Cada mês aprovado carrega a própria tabela. São poucos por ano, então o
  // custo é aceitável; se um dia crescer, dá para carregar sob demanda.
  const periodos: PeriodoAprovado[] = await Promise.all(
    lista.map(async f => {
      const competencia = f.competencia as string
      const { linhas, empresas } = await montarFechamento(competencia)
      return {
        competencia,
        aprovado_por: (f.aprovado_por as string) ?? null,
        aprovado_em: f.aprovado_em as string,
        resumo: {
          colaboradores: Number(f.colaboradores) || 0,
          total_dias: Number(f.total_dias) || 0,
          total_faltas: Number(f.total_faltas) || 0,
          total_gorjeta: Number(f.total_gorjeta) || 0,
          total_salario: Number(f.total_salario) || 0,
        },
        outras: (outrasPorComp.get(competencia) ?? []).sort(),
        linhas,
        empresas,
      }
    }),
  )

  return <AprovadasClient periodos={periodos} />
}
