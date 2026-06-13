// Formatação de valores monetários para contratos: "R$ 2.000,00 (dois mil reais)"

const UNITS = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
  'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
const TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const HUNDREDS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

function threeDigits(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'cem'
  const h = Math.floor(n / 100)
  const rest = n % 100
  const parts: string[] = []
  if (h) parts.push(HUNDREDS[h])
  if (rest) {
    if (rest < 20) parts.push(UNITS[rest])
    else {
      const t = Math.floor(rest / 10), u = rest % 10
      parts.push(u ? `${TENS[t]} e ${UNITS[u]}` : TENS[t])
    }
  }
  return parts.join(' e ')
}

/** Número por extenso em pt-BR (até centenas de milhões). */
export function numeroPorExtenso(n: number): string {
  if (n === 0) return 'zero'
  const milhoes = Math.floor(n / 1_000_000)
  const milhares = Math.floor((n % 1_000_000) / 1000)
  const resto = n % 1000
  const parts: string[] = []
  if (milhoes) parts.push(milhoes === 1 ? 'um milhão' : `${threeDigits(milhoes)} milhões`)
  if (milhares) parts.push(milhares === 1 ? 'mil' : `${threeDigits(milhares)} mil`)
  if (resto) parts.push(threeDigits(resto))
  return parts.join(' e ')
}

/** "2000" / "2000.5" / "2.000,50" → número; null quando não é numérico puro. */
export function parseMoney(raw: string): number | null {
  const s = raw.trim()
  if (!s) return null
  // formato BR: 2.000,50 / 2000,50
  if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(s) || /^\d+(,\d{1,2})?$/.test(s)) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.'))
  }
  // formato simples: 2000 / 2000.50
  if (/^\d+(\.\d{1,2})?$/.test(s)) return parseFloat(s)
  return null
}

/** Formata: "R$ 2.000,00 (dois mil reais)". */
export function formatMoneyExtenso(v: number): string {
  const reais = Math.floor(v)
  const cents = Math.round((v - reais) * 100)
  const fmt = v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const parts: string[] = []
  if (reais > 0) parts.push(`${numeroPorExtenso(reais)} ${reais === 1 ? 'real' : 'reais'}`)
  if (cents > 0) parts.push(`${numeroPorExtenso(cents)} ${cents === 1 ? 'centavo' : 'centavos'}`)
  const extenso = parts.length ? parts.join(' e ') : 'zero reais'
  return `${fmt} (${extenso})`
}
