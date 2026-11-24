/**
 * Aviso prévio trabalhado.
 *
 * Quem pede demissão e cumpre aviso continua TRABALHANDO por 30 dias
 * corridos. Nesse período a pessoa segue `contratado` no Recrutamento — é o
 * que mantém o login dela viva no Portal BDT, porque quem bloqueia o acesso é
 * o cron `sync-desligados` do Portal, que só olha quem está `desligado`.
 *
 * As datas são puras (`yyyy-mm-dd`) e nunca passam por toISOString, que
 * desloca o dia pelo fuso.
 */

/** Dias corridos de aviso prévio (CLT art. 487). */
export const DIAS_AVISO = 30

/** Hoje em São Paulo, como data pura. */
export function hojeIso(): string {
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`
}

/** Soma dias a uma data pura, sem fuso. */
export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  const data = new Date(a, m - 1, d)
  data.setDate(data.getDate() + dias)
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`
}

/**
 * Último dia trabalhado: o primeiro dia do aviso JÁ CONTA.
 * Começou em 24/11 → termina em 23/12, não em 24/12.
 */
export function fimDoAviso(inicio: string): string {
  return somarDias(inicio, DIAS_AVISO - 1)
}

/** Dias que ainda faltam (0 = termina hoje). Negativo = já venceu. */
export function diasRestantes(ate: string, hoje = hojeIso()): number {
  const [a1, m1, d1] = hoje.split('-').map(Number)
  const [a2, m2, d2] = ate.split('-').map(Number)
  return Math.round((new Date(a2, m2 - 1, d2).getTime() - new Date(a1, m1 - 1, d1).getTime()) / 86400000)
}

/** dd/mm/aaaa a partir da data pura. */
export function dataBr(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

/** Está cumprindo aviso AGORA? (data de fim ainda não passou) */
export function emAvisoPrevio(
  app: { status?: string | null; aviso_previo_ate?: string | null } | null | undefined,
  hoje = hojeIso(),
): boolean {
  if (!app?.aviso_previo_ate) return false
  if (app.status === 'desligado') return false
  return app.aviso_previo_ate >= hoje
}
