import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { hojeIso, dataBr } from '@/lib/aviso-previo'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/aviso-previo
 *
 * Fecha o aviso prévio que venceu: quem passou do último dia trabalhado vira
 * `desligado`. A partir daí o Portal BDT faz o resto sozinho — o cron
 * `sync-desligados` roda de hora em hora, inativa o colaborador e bane o
 * login.
 *
 * Roda uma vez por dia (ver `crons` no vercel.json). Atrasar um dia não
 * quebra nada: a varredura pega todo mundo com prazo vencido, não só o de
 * ontem.
 *
 * Fica FORA de `/api/admin` de propósito: o gate de sessão do proxy.ts não se
 * aplica aqui, então a autorização é o segredo do cron — e ela FALHA FECHADA,
 * igual ao cron das análises.
 */
export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET
  if (!segredo) {
    console.error('[cron aviso-previo] CRON_SECRET ausente — recusando por precaução')
    return NextResponse.json({ error: 'Cron não configurado.' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${segredo}`) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const hoje = hojeIso()
  const supabase = await createSupabaseServiceClient()

  // Vencidos = último dia trabalhado JÁ PASSOU. No próprio último dia a pessoa
  // ainda trabalha, então a comparação é estrita.
  const { data: vencidos, error } = await supabase
    .from('applications')
    .select('id, candidate_id, aviso_previo_ate, termination_data, status')
    .not('aviso_previo_ate', 'is', null)
    .lt('aviso_previo_ate', hoje)
    .neq('status', 'desligado')

  if (error) {
    console.error('[cron aviso-previo]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!vencidos?.length) return NextResponse.json({ ok: true, desligados: 0 })

  const nomes: string[] = []
  for (const a of vencidos) {
    const fim = String(a.aviso_previo_ate)
    const dados = (a.termination_data ?? {}) as Record<string, unknown>
    const { error: erroUp } = await supabase
      .from('applications')
      .update({
        status: 'desligado',
        // A saída é no fim do aviso, não no dia em que o cron rodou.
        terminated_at: `${fim}T12:00:00`,
        termination_data: { ...dados, aviso_previo: true, aviso_fim: fim, desligado_pelo_cron_em: hoje },
        updated_at: new Date().toISOString(),
      })
      .eq('id', a.id)
    if (erroUp) { console.error('[cron aviso-previo]', a.id, erroUp.message); continue }
    nomes.push(`${a.candidate_id} (aviso até ${dataBr(fim)})`)
  }

  if (nomes.length) console.log(`[cron aviso-previo] ${nomes.length} desligado(s): ${nomes.join(', ')}`)
  return NextResponse.json({ ok: true, desligados: nomes.length })
}
