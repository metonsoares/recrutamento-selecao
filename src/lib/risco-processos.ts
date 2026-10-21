import type { BackgroundCheckResult } from '@/types'

/**
 * Nível de risco do check de processos — REGRA DA CASA, não opinião da IA.
 *
 * Definida pelo dono em 21/10/2026, depois de um candidato com 3 reclamações
 * trabalhistas aparecer com selo verde "BAIXO":
 *
 *   processo criminal    → alto  (vermelho)
 *   processo trabalhista → alto  (vermelho)
 *   cível e os demais    → médio (amarelo)
 *   nenhum processo      → baixo (verde)
 *
 * A IA continua escrevendo o parecer e classificando CADA processo ("— Tipo:
 * TRABALHISTA"), mas o nível sai daqui: é decisão de negócio, e deixá-la no
 * modelo fazia o mesmo caso virar "baixo" numa ficha e "médio" em outra.
 */
export type NivelRisco = BackgroundCheckResult['nivel_risco']

/** Basta UMA destas no texto do processo para ser criminal. */
const TERMOS_CRIMINAIS = [
  'criminal', 'crime', 'penal', 'termo circunstanciado',
  'inquerito', 'inquérito', 'delito', 'contravencao', 'contravenção',
]

/** Idem para trabalhista — inclui o nome do tribunal, que sempre vem junto. */
const TERMOS_TRABALHISTAS = [
  'trabalhista', 'trabalho', 'reclamatoria', 'reclamatória',
  'reclamante', 'trt', 'clt',
]

/** Tira acento e caixa para a comparação não depender de como a IA escreveu. */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function contemAlgum(texto: string, termos: string[]): boolean {
  return termos.some(t => texto.includes(normalizar(t)))
}

/**
 * Decide o nível a partir do que foi encontrado. Recebe o bloco de processos
 * já montado (resumo + uma linha por processo).
 */
export function nivelDeRisco(
  processos: { encontrado?: boolean; resumo?: string; detalhes?: string[] } | null | undefined,
): NivelRisco {
  if (!processos?.encontrado) return 'baixo'

  const linhas = (processos.detalhes ?? []).filter(Boolean)
  const texto = normalizar([processos.resumo ?? '', ...linhas].join(' | '))

  if (contemAlgum(texto, TERMOS_CRIMINAIS)) return 'alto'
  if (contemAlgum(texto, TERMOS_TRABALHISTAS)) return 'alto'

  // Achou processo mas não deu para dizer de que tipo: médio, nunca baixo —
  // "baixo" é reservado para quem comprovadamente não tem processo.
  return 'medio'
}

/** Por que o nível ficou assim — o recrutador precisa saber o motivo. */
export function motivoDoRisco(nivel: NivelRisco, processos: { detalhes?: string[]; resumo?: string } | null): string {
  if (nivel === 'baixo') return 'Nenhum processo encontrado.'
  const texto = normalizar([processos?.resumo ?? '', ...(processos?.detalhes ?? [])].join(' | '))
  if (contemAlgum(texto, TERMOS_CRIMINAIS)) return 'Há processo criminal — risco alto pela regra da empresa.'
  if (contemAlgum(texto, TERMOS_TRABALHISTAS)) return 'Há processo trabalhista — risco alto pela regra da empresa.'
  return 'Há processo cível ou de outra natureza — risco médio pela regra da empresa.'
}
