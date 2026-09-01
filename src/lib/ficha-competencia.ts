/**
 * Qual ficha de admissão valia num mês.
 *
 * Transferir de empresa arquiva a ficha antiga em `admission_form_history` e
 * a ficha ATIVA passa a ser a da empresa nova, com a data de admissão nova.
 * Quem olhar só a ficha ativa, portanto, vê o colaborador na empresa de hoje
 * e "ainda não admitido" nos meses anteriores — foi assim que agosto perdeu
 * duas pessoas que trabalharam agosto inteiro na ACRM.
 *
 * A folha de um mês tem que enxergar o mês: a ficha que vale é a que estava
 * em vigor quando aquele mês fechou.
 */

export interface FichaComHistorico {
  admission_form?: unknown
  admission_form_history?: unknown
}

type Ficha = Record<string, unknown>

/**
 * A ficha vigente no ÚLTIMO dia da competência (`fim` = 'AAAA-MM-DD').
 *
 * Ficha arquivada DEPOIS do fim do mês ainda era a ficha daquele mês. Entre
 * várias, vale a primeira arquivada — a que fechou o mês. Transferência no
 * meio do mês fica com a empresa em que o mês terminou: é uma escolha, e a
 * alternativa (dividir a folha do mesmo colaborador em duas empresas) seria
 * pior de conferir.
 */
export function fichaDaCompetencia(app: FichaComHistorico, fim: string): Ficha | null {
  const ativa = (app.admission_form as Ficha | null) ?? null
  const historico = Array.isArray(app.admission_form_history)
    ? (app.admission_form_history as Ficha[])
    : []

  const anteriores = historico
    .filter(h => {
      const carimbo = typeof h?.arquivada_em === 'string' ? h.arquivada_em.slice(0, 10) : ''
      return carimbo > fim
    })
    .sort((a, b) => String(a.arquivada_em).localeCompare(String(b.arquivada_em)))

  return anteriores[0] ?? ativa
}
