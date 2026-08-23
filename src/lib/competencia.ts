/**
 * Competência (mês de referência) das telas de Folha de pagamento.
 *
 * Estes helpers viviam copiados em 6 arquivos — e as cópias tinham divergido:
 * metade guardava contra competência inválida e metade não, então uma
 * competência malformada na URL renderizava "undefined de NaN" em Gorjetas,
 * Vale transporte e Prêmio Caju. Aqui a guarda é única.
 *
 * Formato canônico: `yyyy-mm-01`. Datas puras são manipuladas como STRING —
 * `new Date()` em data pura desloca o dia pelo fuso.
 */

export const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
] as const

/** `2026-08-01` → `agosto de 2026`. Competência inválida vira '—'. */
export function rotuloMes(competencia: string): string {
  const [ano, mes] = String(competencia ?? '').split('-').map(Number)
  const nome = MESES[mes - 1]
  if (!nome || !Number.isFinite(ano)) return '—'
  return `${nome} de ${ano}`
}

/** Igual a `rotuloMes`, com a inicial maiúscula: `Agosto de 2026`. */
export function rotuloMesLongo(competencia: string): string {
  return maiuscula(rotuloMes(competencia))
}

export function maiuscula(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Mês anterior (-1) ou seguinte (+1), no formato canônico. */
export function mesVizinho(competencia: string, delta: number): string {
  const [ano, mes] = competencia.split('-').map(Number)
  if (!Number.isFinite(ano) || !Number.isFinite(mes)) return competencia
  const d = new Date(ano, mes - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/** Mês corrente no fuso de São Paulo (o servidor da Vercel roda em UTC). */
export function mesCorrente(): string {
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-01`
}

/** Último dia do mês da competência, em `yyyy-mm-dd`. */
export function fimDoMes(competencia: string): string {
  const [ano, mes] = competencia.split('-').map(Number)
  const ultimo = new Date(ano, mes, 0).getDate()
  return `${ano}-${String(mes).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`
}

/** True se a string está no formato canônico aceito pelas rotas. */
export function competenciaValida(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-01$/.test(v)
}
