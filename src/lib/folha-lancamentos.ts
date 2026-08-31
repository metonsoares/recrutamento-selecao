/**
 * Lançamentos mensais de folha que seguem o mesmo molde.
 *
 * Cada tipo declara só o que muda: rótulo, quais CONTAGENS ele lança, se tem
 * coluna de valor e quem entra na lista. O resto — busca, filtro de empresa,
 * navegação por mês, aprovação, histórico e exportação — é código único.
 *
 * Acrescentar um lançamento novo é acrescentar uma entrada aqui.
 */

export type TipoLancamento =
  | 'avarias'
  | 'domingos-feriados'
  | 'horas-extras'
  | 'gratificacao'
  | 'cargo-confianca'
  | 'insalubridade'
  | 'quebra-caixa'

/** Campos de contagem disponíveis em folha_itens. */
export type CampoContagem = 'quantidade' | 'quantidade2' | 'quantidade3'

export interface ColunaContagem {
  campo: CampoContagem
  rotulo: string
}

export interface ConfigLancamento {
  slug: TipoLancamento
  titulo: string
  descricao: string
  /** Contagens lançadas por colaborador. Vazio = o tipo só tem valor. */
  colunas: ColunaContagem[]
  /** Tem coluna de valor em R$. */
  temValor: boolean
  /**
   * Vários lançamentos por colaborador no mesmo mês, cada um com descrição —
   * é o caso das avarias, em que o desconto do mês é a soma de itens
   * identificáveis, e não um valor único.
   */
  itensMultiplos?: boolean
  /** Rótulo do campo de descrição, quando há vários itens. */
  rotuloDescricao?: string
  /**
   * Quando definido, só entra na lista quem tem esta resposta = Sim na ficha.
   * Segue o que a tela de Gorjetas já faz: não faz sentido cobrar valor de
   * insalubridade de quem a ficha diz que não recebe.
   */
  campoFicha?: 'cargo_confianca' | 'insalubridade_20' | 'quebra_caixa_15'
  /**
   * Quando definido, o valor já vem calculado como este percentual do salário
   * da ficha (0.4 = 40%). Continua editável: a conta é um ponto de partida,
   * não uma trava — salário por hora, proporcional e reajuste no meio do mês
   * são casos em que o RH precisa corrigir.
   */
  percentualSalario?: number
}

export const LANCAMENTOS: Record<TipoLancamento, ConfigLancamento> = {
  'avarias': {
    slug: 'avarias',
    titulo: 'Avarias',
    descricao: 'Itens avariados no período, um a um. O desconto do mês é a soma deles.',
    colunas: [],
    temValor: true,
    itensMultiplos: true,
    rotuloDescricao: 'Descrição do item',
  },
  'domingos-feriados': {
    slug: 'domingos-feriados',
    titulo: 'Domingos e feriados',
    descricao: 'Quantos domingos e quantos feriados o colaborador trabalhou no mês.',
    colunas: [
      { campo: 'quantidade', rotulo: 'Domingos' },
      { campo: 'quantidade2', rotulo: 'Feriados' },
    ],
    temValor: false,
  },
  'horas-extras': {
    slug: 'horas-extras',
    titulo: 'Horas extras',
    descricao: 'Horas do mês por tipo de adicional.',
    colunas: [
      { campo: 'quantidade', rotulo: 'Adicional noturno 20%' },
      { campo: 'quantidade2', rotulo: 'Hora 50%' },
      { campo: 'quantidade3', rotulo: 'Hora 100%' },
    ],
    temValor: false,
  },
  'gratificacao': {
    slug: 'gratificacao',
    titulo: 'Gratificação',
    descricao: 'Gratificações do período. Aprovar registra o mês.',
    colunas: [],
    temValor: true,
  },
  'cargo-confianca': {
    slug: 'cargo-confianca',
    titulo: 'Cargo de confiança',
    descricao: 'Adicional de 40% sobre o salário. Lista só quem tem "Sim" na ficha.',
    colunas: [],
    temValor: true,
    campoFicha: 'cargo_confianca',
    percentualSalario: 0.4,
  },
  'insalubridade': {
    slug: 'insalubridade',
    titulo: 'Insalubridade',
    descricao: 'Adicional de 20% sobre o salário. Lista só quem tem "Sim" na ficha.',
    colunas: [],
    temValor: true,
    campoFicha: 'insalubridade_20',
    percentualSalario: 0.2,
  },
  'quebra-caixa': {
    slug: 'quebra-caixa',
    titulo: 'Quebra de caixa',
    descricao: 'Adicional de 15% sobre o salário. Lista só quem tem "Sim" na ficha.',
    colunas: [],
    temValor: true,
    campoFicha: 'quebra_caixa_15',
    percentualSalario: 0.15,
  },
}

/** Ordem em que aparecem no menu. */
export const ORDEM_LANCAMENTOS: TipoLancamento[] = [
  'avarias', 'domingos-feriados', 'horas-extras', 'gratificacao',
  'cargo-confianca', 'insalubridade', 'quebra-caixa',
]

export function tipoValido(v: unknown): v is TipoLancamento {
  return typeof v === 'string' && v in LANCAMENTOS
}
