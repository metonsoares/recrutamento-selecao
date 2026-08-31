import { requireMaster } from '@/lib/auth-guard'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { LANCAMENTOS, ORDEM_LANCAMENTOS } from '@/lib/folha-lancamentos'
import { AprovadasClient, PeriodoAprovado } from './aprovadas-client'

export const dynamic = 'force-dynamic'

/**
 * Folhas aprovadas — o que já foi fechado, por período.
 *
 * Junta as aprovações que hoje moram em tabelas diferentes: o fechamento de
 * folha, os sete lançamentos (folha_ciclos), o vale transporte, as gorjetas e
 * o prêmio caju. A tela é só leitura: aprovar continua sendo na tela de cada
 * assunto, que é onde se confere linha a linha.
 */
export default async function FolhasAprovadasPage() {
  await requireMaster()
  const supabase = await createSupabaseServiceClient()

  const [
    { data: fechamentos }, { data: lancamentos },
    { data: vt }, { data: gorjetas }, { data: premio },
  ] = await Promise.all([
    supabase.from('fechamento_ciclos')
      .select('competencia, colaboradores, total_dias, total_faltas, total_gorjeta, total_salario, aprovado_por, aprovado_em'),
    supabase.from('folha_ciclos')
      .select('tipo, competencia, total_valor, total_qtd, total_qtd2, total_qtd3, aprovado_por, aprovado_em'),
    supabase.from('vt_ciclos').select('competencia, total_dias, aprovado_por, aprovado_em'),
    supabase.from('gorjeta_ciclos').select('competencia, total, aprovado_por, aprovado_em'),
    supabase.from('premio_caju_ciclos').select('competencia, total, aprovado_por, aprovado_em'),
  ])

  /** competência → o que foi aprovado nela */
  const porCompetencia = new Map<string, PeriodoAprovado>()
  const pegar = (competencia: string): PeriodoAprovado => {
    const atual = porCompetencia.get(competencia)
    if (atual) return atual
    const novo: PeriodoAprovado = { competencia, fechamento: null, itens: [] }
    porCompetencia.set(competencia, novo)
    return novo
  }

  for (const f of fechamentos ?? []) {
    pegar(f.competencia as string).fechamento = {
      colaboradores: Number(f.colaboradores) || 0,
      total_dias: Number(f.total_dias) || 0,
      total_faltas: Number(f.total_faltas) || 0,
      total_gorjeta: Number(f.total_gorjeta) || 0,
      total_salario: Number(f.total_salario) || 0,
      aprovado_por: (f.aprovado_por as string) ?? null,
      aprovado_em: f.aprovado_em as string,
    }
  }

  for (const l of lancamentos ?? []) {
    const tipo = l.tipo as string
    const config = ORDEM_LANCAMENTOS.includes(tipo as never)
      ? LANCAMENTOS[tipo as keyof typeof LANCAMENTOS]
      : null
    // Resumo legível: as contagens que o tipo declara + o valor, quando tem.
    const partes: string[] = []
    if (config) {
      const totais = [Number(l.total_qtd) || 0, Number(l.total_qtd2) || 0, Number(l.total_qtd3) || 0]
      config.colunas.forEach((c, i) => {
        if (totais[i] > 0) partes.push(`${totais[i]} ${c.rotulo.toLowerCase()}`)
      })
    }
    pegar(l.competencia as string).itens.push({
      chave: `lanc-${tipo}`,
      titulo: config?.titulo ?? tipo,
      valor: Number(l.total_valor) || 0,
      resumo: partes.join(' · '),
      aprovado_por: (l.aprovado_por as string) ?? null,
      aprovado_em: l.aprovado_em as string,
      link: `/admin/folha-pagamento/lancamentos/${tipo}?competencia=${l.competencia}`,
    })
  }

  for (const v of vt ?? []) {
    pegar(v.competencia as string).itens.push({
      chave: 'vale-transporte',
      titulo: 'Vale transporte',
      valor: 0,
      resumo: `${Number(v.total_dias) || 0} dias`,
      aprovado_por: (v.aprovado_por as string) ?? null,
      aprovado_em: v.aprovado_em as string,
      link: `/admin/folha-pagamento/vale-transporte?competencia=${v.competencia}`,
    })
  }
  for (const g of gorjetas ?? []) {
    pegar(g.competencia as string).itens.push({
      chave: 'gorjetas',
      titulo: 'Gorjetas',
      valor: Number(g.total) || 0,
      resumo: '',
      aprovado_por: (g.aprovado_por as string) ?? null,
      aprovado_em: g.aprovado_em as string,
      link: `/admin/folha-pagamento/gorjetas?competencia=${g.competencia}`,
    })
  }
  for (const p of premio ?? []) {
    pegar(p.competencia as string).itens.push({
      chave: 'premio-caju',
      titulo: 'Prêmio Caju',
      valor: Number(p.total) || 0,
      resumo: '',
      aprovado_por: (p.aprovado_por as string) ?? null,
      aprovado_em: p.aprovado_em as string,
      link: `/admin/folha-pagamento/premio-caju?competencia=${p.competencia}`,
    })
  }

  const periodos = Array.from(porCompetencia.values())
    .map(p => ({ ...p, itens: p.itens.sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR')) }))
    .sort((a, b) => b.competencia.localeCompare(a.competencia))

  return <AprovadasClient periodos={periodos} />
}
