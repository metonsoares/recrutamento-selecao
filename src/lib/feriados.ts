/**
 * Feriados nacionais e a regra de quando as férias PODEM começar.
 *
 * Base legal (CLT, Decreto-Lei nº 5.452/1943):
 *  - art. 134, §3º — "É vedado o início das férias no período de dois dias que
 *    antecede feriado ou dia de repouso semanal remunerado."
 *  - art. 135 — o aviso ao colaborador sai com 30 dias de antecedência.
 *  - art. 145 — o pagamento sai até 2 dias antes do início das férias.
 *
 * Só feriados NACIONAIS entram aqui. Feriado municipal (Petrópolis, por
 * exemplo) não tem lista oficial estável para embutir no código: quando for
 * preciso, acrescente em `FERIADOS_EXTRAS` com a data exata.
 */

/** Feriados fixos nacionais: mês-dia. */
const FIXOS = [
  '01-01', // Confraternização Universal
  '04-21', // Tiradentes
  '05-01', // Dia do Trabalho
  '09-07', // Independência
  '10-12', // Nossa Senhora Aparecida
  '11-02', // Finados
  '11-15', // Proclamação da República
  '11-20', // Consciência Negra (nacional desde 2024, Lei 14.759/2023)
  '12-25', // Natal
]

/** Datas extras (feriado municipal, ponto facultativo tratado como feriado). */
const FERIADOS_EXTRAS: string[] = []

/** Domingo de Páscoa pelo algoritmo de Meeus/Jones/Butcher. */
function pascoa(ano: number): Date {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(ano, mes - 1, dia)
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function somar(d: Date, dias: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + dias)
  return r
}

const cache = new Map<number, Set<string>>()

/** Todos os feriados nacionais do ano, em `yyyy-mm-dd`. */
export function feriadosDoAno(ano: number): Set<string> {
  const pronto = cache.get(ano)
  if (pronto) return pronto

  const dias = new Set<string>(FIXOS.map(md => `${ano}-${md}`))
  const dom = pascoa(ano)
  dias.add(iso(somar(dom, -48)))  // segunda de carnaval
  dias.add(iso(somar(dom, -47)))  // terça de carnaval
  dias.add(iso(somar(dom, -2)))   // sexta-feira santa
  dias.add(iso(somar(dom, 60)))   // corpus christi
  for (const extra of FERIADOS_EXTRAS) if (extra.startsWith(String(ano))) dias.add(extra)

  cache.set(ano, dias)
  return dias
}

export function ehFeriado(data: string): boolean {
  const ano = Number(data.slice(0, 4))
  if (!ano) return false
  return feriadosDoAno(ano).has(data.slice(0, 10))
}

/** Nome do dia da semana, para explicar o motivo na tela. */
const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

export function diaDaSemana(data: string): string {
  return DIAS_SEMANA[new Date(data.slice(0, 10) + 'T00:00:00').getDay()] ?? ''
}

/**
 * Por que as férias NÃO podem começar nesse dia — `null` quando podem.
 *
 * O repouso semanal remunerado aqui é o DOMINGO, que é a regra geral. Escala
 * com folga em outro dia da semana é exceção e precisaria vir da ficha; se um
 * dia isso existir, é aqui que entra.
 */
export function impedimentoParaIniciarFerias(data: string): string | null {
  const d = data.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null

  if (ehFeriado(d)) return `${formatarBr(d)} é feriado`

  const diaSemana = new Date(d + 'T00:00:00').getDay()
  if (diaSemana === 0) return `${formatarBr(d)} é domingo (repouso semanal)`
  if (diaSemana === 6) return `${formatarBr(d)} é sábado (véspera do repouso semanal)`

  // Dois dias que antecedem feriado ou o repouso semanal (domingo).
  for (let i = 1; i <= 2; i++) {
    const seguinte = new Date(d + 'T00:00:00')
    seguinte.setDate(seguinte.getDate() + i)
    const isoSeguinte = iso(seguinte)
    if (seguinte.getDay() === 0) {
      return `${formatarBr(d)} é ${diaDaSemana(d)} — começa nos 2 dias que antecedem o domingo (art. 134, §3º)`
    }
    if (ehFeriado(isoSeguinte)) {
      return `${formatarBr(d)} está nos 2 dias que antecedem o feriado de ${formatarBr(isoSeguinte)} (art. 134, §3º)`
    }
  }
  return null
}

export function podeIniciarFerias(data: string): boolean {
  return impedimentoParaIniciarFerias(data) === null
}

/** Próximo dia (a partir de `data`) em que as férias podem começar. */
export function proximoInicioValido(data: string): string {
  let d = data.slice(0, 10)
  for (let i = 0; i < 40; i++) {
    if (podeIniciarFerias(d)) return d
    const prox = new Date(d + 'T00:00:00')
    prox.setDate(prox.getDate() + 1)
    d = iso(prox)
  }
  return data.slice(0, 10)
}

/** Último dia ATÉ `data` em que as férias ainda podiam começar. */
export function ultimoInicioValido(data: string): string {
  let d = data.slice(0, 10)
  for (let i = 0; i < 40; i++) {
    if (podeIniciarFerias(d)) return d
    const ant = new Date(d + 'T00:00:00')
    ant.setDate(ant.getDate() - 1)
    d = iso(ant)
  }
  return data.slice(0, 10)
}

function formatarBr(data: string): string {
  const [a, m, d] = data.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}
