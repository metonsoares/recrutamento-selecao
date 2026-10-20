import { NextRequest, NextResponse } from 'next/server'
import { processarFila } from '@/lib/fila-ia'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET /api/cron/analises
 *
 * Worker da fila de análises, chamado pelo Cron da Vercel (ver `crons` no
 * vercel.json). É a rede de segurança: o disparo imediato que acontece no
 * envio do currículo e no teste cultural pode não vingar — o processo morre, a
 * rede falha, a função é encerrada antes —, e é este cron que recolhe o que
 * ficou para trás, inclusive jobs de um worker que morreu no meio (o
 * `locked_until` vence e eles voltam para a fila sozinhos).
 *
 * Fica FORA de `/api/admin` de propósito: o gate de sessão do proxy.ts não se
 * aplica aqui, então a autorização é o segredo do cron — e ela FALHA FECHADA.
 * Sem `CRON_SECRET` no servidor, a rota recusa todo mundo em vez de ficar
 * aberta, que foi exatamente o erro da antiga exceção `INTERNAL_ALLOW`.
 */
export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET
  if (!segredo) {
    console.error('[cron analises] CRON_SECRET ausente — recusando por precaução')
    return NextResponse.json({ error: 'Cron não configurado.' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${segredo}`) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  // 5 por rodada: com o cron de 5 em 5 minutos dá vazão de sobra para o volume
  // real (25 candidaturas nos últimos 30 dias) sem estourar o tempo da função.
  const resumo = await processarFila(5)

  if (resumo.reivindicados > 0) {
    console.log(`[cron analises] ${resumo.reivindicados} job(s): ${resumo.concluidos} ok, ${resumo.falhados} com erro`)
  }
  return NextResponse.json({ ok: true, ...resumo })
}
