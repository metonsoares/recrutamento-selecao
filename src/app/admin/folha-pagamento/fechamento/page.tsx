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

  const supabase = await createSupabaseServiceClient()
  const { data: aprovacao } = await supabase
    .from('fechamento_ciclos')
    .select('aprovado_por, aprovado_em').eq('competencia', competencia).maybeSingle()

  return (
    <FechamentoClient
      competencia={competencia}
      linhas={linhas}
      empresas={empresas}
      temFechamentoVt={temFechamentoVt}
      temFechamentoGorjeta={temFechamentoGorjeta}
      aprovacao={aprovacao ? {
        aprovado_por: (aprovacao.aprovado_por as string) ?? null,
        aprovado_em: aprovacao.aprovado_em as string,
      } : null}
    />
  )
}
