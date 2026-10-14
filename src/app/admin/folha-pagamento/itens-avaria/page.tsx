import { requireAnyRole } from '@/lib/auth-guard'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { LANCAMENTOS } from '@/lib/folha-lancamentos'
import { ItensAvariaClient, ItemAvaria } from './itens-avaria-client'

export const dynamic = 'force-dynamic'

/**
 * Itens de avaria — a lista de preços usada na tela de Avarias.
 *
 * Mesmo guard da tela de Avarias: quem lança é quem cadastra, e isso sai da
 * configuração do lançamento, não de uma segunda lista de perfis.
 */
export default async function ItensAvariaPage() {
  await requireAnyRole(LANCAMENTOS['avarias'].perfis)
  const supabase = await createSupabaseServiceClient()

  const { data } = await supabase
    .from('avaria_itens').select('id, nome, valor, ativo').order('nome')

  const itens: ItemAvaria[] = (data ?? []).map(i => ({
    id: i.id as string,
    nome: i.nome as string,
    valor: Number(i.valor) || 0,
    ativo: i.ativo !== false,
  }))

  return <ItensAvariaClient itens={itens} />
}
