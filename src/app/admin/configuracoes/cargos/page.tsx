import { requirePermission } from '@/lib/auth-guard'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { CargosClient, CargoLinha } from './cargos-client'

export const dynamic = 'force-dynamic'

/**
 * Cadastro de cargos.
 *
 * A contagem de pessoas por cargo sai das fichas (o cargo é texto lá), e é ela
 * que diz se dá para remover um cargo sem deixar ficha órfã. Consultas simples
 * e cruzamento em memória: embeds do PostgREST já falharam calados neste projeto.
 */
export default async function CargosPage() {
  await requirePermission('config.empresa_cadastro')
  const service = await createSupabaseServiceClient()

  const [{ data: cargos }, { data: apps }] = await Promise.all([
    service.from('cargos').select('id, nome, ativo').order('nome'),
    service.from('applications')
      .select('cargo:admission_form->>function_title')
      .eq('is_latest', true),
  ])

  const pessoasPorCargo = new Map<string, number>()
  for (const a of apps ?? []) {
    const nome = String((a as { cargo?: string | null }).cargo ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
    if (!nome) continue
    pessoasPorCargo.set(nome, (pessoasPorCargo.get(nome) ?? 0) + 1)
  }

  const linhas: CargoLinha[] = (cargos ?? []).map(c => ({
    id: c.id as string,
    nome: c.nome as string,
    pessoas: pessoasPorCargo.get(String(c.nome).toLowerCase()) ?? 0,
  }))

  // Cargo que aparece na ficha de alguém mas não está na lista: mostramos para
  // o RH decidir se cadastra ou se corrige a ficha.
  const cadastrados = new Set(linhas.map(l => l.nome.toLowerCase()))
  const foraDaLista = [...pessoasPorCargo.entries()]
    .filter(([nome]) => !cadastrados.has(nome))
    .map(([nome, pessoas]) => ({ nome, pessoas }))
    .sort((a, b) => b.pessoas - a.pessoas)

  return <CargosClient linhas={linhas} foraDaLista={foraDaLista} />
}
