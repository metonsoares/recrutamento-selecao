/**
 * Horas lançadas na folha: "6,08" é SEIS HORAS E OITO MINUTOS, não 6,08 horas.
 *
 * O campo sempre foi preenchido assim pelo RH, e o banco guarda o número como
 * veio (6.08). Somar isso como decimal erra quando os minutos passam de 60
 * — 6,50 + 6,50 daria 13,00 em vez de 13h40 —, então tudo que soma ou exibe
 * hora passa por aqui: converte para minutos, faz a conta, volta em hh:mm.
 */

/** 6.08 (6h08) → 368 minutos. */
export function horasParaMinutos(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 0
  const horas = Math.trunc(v)
  const minutos = Math.round((v - horas) * 100)
  return horas * 60 + minutos
}

/** 368 → "06:08". */
export function minutosParaHhMm(min: number): string {
  const total = Math.max(0, Math.round(min))
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** 6.08 → "06:08"; 0 vira string vazia (campo em branco na folha). */
export function formatarHoras(v: number): string {
  return v > 0 ? minutosParaHhMm(horasParaMinutos(v)) : ''
}

/**
 * "06:08", "6:8", "6,08" ou "608" → 6.08, que é como o valor é gravado.
 * Minuto acima de 59 vira hora: "1:90" → 2.30.
 */
export function hhMmParaNumero(texto: string): number {
  const limpo = String(texto ?? '').replace(/[^\d:,.]/g, '').replace(/[,.]/g, ':')
  if (!limpo) return 0

  let h = 0
  let m = 0
  if (limpo.includes(':')) {
    const [a, b = ''] = limpo.split(':')
    h = Number(a) || 0
    // "6:8" é 6h08, não 6h80: minuto de um dígito completa à esquerda.
    m = Number(b.slice(0, 2).padStart(2, '0')) || 0
  } else {
    // Digitação corrida: os dois últimos dígitos são os minutos.
    const d = limpo.padStart(3, '0')
    h = Number(d.slice(0, -2)) || 0
    m = Number(d.slice(-2)) || 0
  }
  const total = h * 60 + m
  return Math.floor(total / 60) + (total % 60) / 100
}
