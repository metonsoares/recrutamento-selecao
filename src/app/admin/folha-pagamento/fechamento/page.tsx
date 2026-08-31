import { requireMaster } from '@/lib/auth-guard'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { mesCorrente, competenciaValida } from '@/lib/competencia'
import { montarFechamento } from '@/lib/fechamento-folha'
import { FechamentoClient } from './fechamento-client'

export const dynamic = 'force-dynamic'

/**
 * Fechamento de folha — exclusivo do Master.
 *
 * Consolida numa linha só o que hoje está espalhado em cinco telas: dias
 * trabalhados (Vale transporte), faltas, gorjeta aprovada e as respostas da
 * ficha. Nada aqui é digitado de novo — só o comentário.
 */
export default async function FechamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ competencia?: string }>
}) {
  await requireMaster()
  const sp = await searchParams
  const competencia = competenciaValida(sp.competencia) ? sp.competencia : mesCorrente()

  // A montagem vive em lib/fechamento-folha porque a tela de Folhas aprovadas
  // mostra exatamente a mesma tabela — duplicar faria as duas divergirem.
  const { linhas, empresas, temFechamentoVt, temFechamentoGorjeta } = await montarFechamento(competencia)

  // A aprovação é por empresa: o mês pode ter algumas fechadas e outras não.
  const supabase = await createSupabaseServiceClient()
  const { data: ciclos } = await supabase
    .from('fechamento_ciclos')
    .select('id, empresa_id, empresa_nome, colaboradores, aprovado_por, aprovado_em')
    .eq('competencia', competencia)

  const cicloIds = (ciclos ?? []).map(c => c.id as string)
  const { data: itens } = cicloIds.length
    ? await supabase.from('fechamento_itens').select('candidate_id').in('ciclo_id', cicloIds)
    : { data: [] as { candidate_id: string }[] }

  const aprovacoes = (ciclos ?? []).map(c => ({
    empresa_id: (c.empresa_id as string) ?? null,
    empresa_nome: (c.empresa_nome as string) ?? null,
    colaboradores: Number(c.colaboradores) || 0,
    aprovado_por: (c.aprovado_por as string) ?? null,
    aprovado_em: c.aprovado_em as string,
  }))

  return (
    <FechamentoClient
      competencia={competencia}
      linhas={linhas}
      empresas={empresas}
      temFechamentoVt={temFechamentoVt}
      temFechamentoGorjeta={temFechamentoGorjeta}
      aprovacoes={aprovacoes}
      jaAprovados={(itens ?? []).map(i => i.candidate_id as string)}
    />
  )
}
