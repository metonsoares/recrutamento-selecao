/**
 * Salário em vigor numa data.
 *
 * A ficha de admissão guarda o salário da ADMISSÃO e nunca é reescrita; todo
 * aumento vive em `salary_raises`, com a data em que passou a valer. Quem lê só
 * a ficha mostra valor velho — foi exatamente o que acontecia no relatório de
 * salários, e aconteceria também nos percentuais da folha (insalubridade 20%,
 * cargo de confiança 40%), que são calculados sobre o salário.
 *
 * Por isso a resposta a "quanto essa pessoa ganha" sai daqui, e sempre com uma
 * data de referência: no relatório é hoje; na folha é o fim da competência, de
 * modo que um mês passado continua mostrando o salário daquele mês.
 */

export interface AumentoSalario {
  /** 'AAAA-MM-DD' — a partir de quando o novo valor vale. */
  raise_date: string
  new_value: number
}

/** Formato usado na ficha ("R$ 1.892,34"), para os leitores não mudarem de parser. */
function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * O último aumento com data até `ate`; sem nenhum, o salário da ficha.
 * Aumento com data futura não vale ainda.
 */
export function salarioVigente(
  salarioFicha: string | null,
  aumentos: AumentoSalario[] | undefined,
  ate: string,
): string | null {
  const validos = (aumentos ?? [])
    .filter(a => typeof a.raise_date === 'string' && a.raise_date.slice(0, 10) <= ate && Number(a.new_value) > 0)
    .sort((a, b) => a.raise_date.localeCompare(b.raise_date))

  const ultimo = validos[validos.length - 1]
  return ultimo ? brl(Number(ultimo.new_value)) : salarioFicha
}

/** Linhas de `salary_raises` agrupadas por colaborador. */
export function agruparAumentos(
  linhas: { candidate_id: string; raise_date: string; new_value: number }[] | null | undefined,
): Map<string, AumentoSalario[]> {
  const mapa = new Map<string, AumentoSalario[]>()
  for (const l of linhas ?? []) {
    const id = l.candidate_id
    if (!id) continue
    const lista = mapa.get(id) ?? []
    lista.push({ raise_date: String(l.raise_date), new_value: Number(l.new_value) })
    mapa.set(id, lista)
  }
  return mapa
}
