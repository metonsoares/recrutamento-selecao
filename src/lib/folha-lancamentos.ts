/**
 * Lançamentos mensais de folha que seguem o mesmo molde.
 *
 * Cada tipo define só o que muda: o rótulo, a unidade lançada e quem entra na
 * lista. O resto — busca, filtro de empresa, navegação por mês, aprovação,
 * histórico e exportação — é um código só, compartilhado.
 */

export type TipoLancamento =
  | 'avarias'
  | 'domingos-feriados'
  | 'horas-extras'
  | 'gratificacao'
  | 'cargo-confianca'
  | 'insalubridade'
  | 'quebra-caixa'

export interface ConfigLancamento {
  slug: TipoLancamento
  titulo: string
  descricao: string
  /** O que se digita por colaborador. */
  unidade: 'valor' | 'quantidade' | 'ambos'
  /** Rótulo da coluna de quantidade, quando existe. */
  rotuloQtd?: string
  /**
   * Quando definido, só entra na lista quem tem esta resposta = Sim na ficha.
   * Segue o que a tela de Gorjetas já faz: não faz sentido cobrar valor de
   * insalubridade de quem a ficha diz que não recebe.
   */
  campoFicha?: 'cargo_confianca' | 'insalubridade_20' | 'quebra_caixa_15'
}

export const LANCAMENTOS: Record<TipoLancamento, ConfigLancamento> = {
  'avarias': {
    slug: 'avarias',
    titulo: 'Avarias',
    descricao: 'Descontos por avaria no período. Aprovar registra o mês.',
    unidade: 'valor',
  },
  'domingos-feriados': {
    slug: 'domingos-feriados',
    titulo: 'Domingos e feriados',
    descricao: 'Dias trabalhados em domingo ou feriado e o valor devido.',
    unidade: 'ambos',
    rotuloQtd: 'Dias',
  },
  'horas-extras': {
    slug: 'horas-extras',
    titulo: 'Horas extras',
    descricao: 'Horas extras do período e o valor correspondente.',
    unidade: 'ambos',
    rotuloQtd: 'Horas',
  },
  'gratificacao': {
    slug: 'gratificacao',
    titulo: 'Gratificação',
    descricao: 'Gratificações do período. Aprovar registra o mês.',
    unidade: 'valor',
  },
  'cargo-confianca': {
    slug: 'cargo-confianca',
    titulo: 'Cargo de confiança',
    descricao: 'Adicional de cargo de confiança. Lista só quem tem "Sim" na ficha.',
    unidade: 'valor',
    campoFicha: 'cargo_confianca',
  },
  'insalubridade': {
    slug: 'insalubridade',
    titulo: 'Insalubridade',
    descricao: 'Adicional de insalubridade 20%. Lista só quem tem "Sim" na ficha.',
    unidade: 'valor',
    campoFicha: 'insalubridade_20',
  },
  'quebra-caixa': {
    slug: 'quebra-caixa',
    titulo: 'Quebra de caixa',
    descricao: 'Adicional de quebra de caixa 15%. Lista só quem tem "Sim" na ficha.',
    unidade: 'valor',
    campoFicha: 'quebra_caixa_15',
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
