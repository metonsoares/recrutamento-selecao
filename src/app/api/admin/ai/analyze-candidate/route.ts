import { NextRequest, NextResponse } from 'next/server'
import { analisarCandidatura } from '@/lib/analise-ia'
import { requirePermissionApi } from '@/lib/auth-guard'
import { concluirJobDaCandidatura } from '@/lib/fila-ia'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/ai/analyze-candidate
 *
 * Análise sob demanda, pelo botão "Analisar com IA" da ficha: roda na hora e
 * devolve o resultado, porque quem clicou está olhando a tela.
 *
 * Esta rota exigia APENAS estar na lista de exceções do proxy — era chamada em
 * fire-and-forget pelos formulários públicos e, por isso, ficava aberta a
 * qualquer pessoa na internet, que podia disparar análise de qualquer
 * candidatura (gastando crédito e sobrescrevendo o parecer). Os formulários
 * públicos agora ENFILEIRAM em vez de chamar, então a rota voltou a ser o que
 * deveria: administrativa, com sessão e permissão.
 */
export async function POST(req: NextRequest) {
  const denied = await requirePermissionApi('acao.analise_ia')
  if (denied) return denied

  let applicationId = ''
  try { applicationId = (await req.json())?.applicationId || '' } catch { /* ignore */ }
  if (!applicationId) return NextResponse.json({ error: 'applicationId required' }, { status: 400 })

  const result = await analisarCandidatura(applicationId)

  // Se havia job na fila para esta candidatura, a análise manual já resolveu:
  // fechar evita o worker refazer o mesmo trabalho e gastar crédito à toa.
  if (!result.error) await concluirJobDaCandidatura(applicationId, result.provider)

  return NextResponse.json({ ok: true, ...result })
}
