import { createSupabaseServiceClient } from '@/lib/supabase-server'

/**
 * Lista oficial de cargos, em ordem alfabética.
 *
 * A tabela `cargos` tem RLS sem policy (só service role), então quem lê é
 * sempre o cliente de serviço — por isso esta função existe: as telas que
 * precisam do combo não repetem a consulta nem erram o cliente.
 */
export async function listarCargos(
  service?: Awaited<ReturnType<typeof createSupabaseServiceClient>>,
): Promise<string[]> {
  const db = service ?? (await createSupabaseServiceClient())
  const { data } = await db.from('cargos').select('nome').eq('ativo', true).order('nome')
  return (data ?? []).map(c => String(c.nome))
}
