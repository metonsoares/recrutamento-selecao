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

/** Perfis que alcançam o lançamento. Master está sempre incluído. */
export type PerfilLancamento = 'master' | 'gestor_rh'

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
   * Quando definido, o valor vem calculado como este percentual do salário da
   * ficha (0.4 = 40%). Por padrão a conta é um ponto de partida EDITÁVEL —
   * salário por hora, proporcional e reajuste no meio do mês são casos em que
   * o RH precisa corrigir. Use `valorCalculado` para travar.
   */
  percentualSalario?: number
  /**
   * O valor é o percentual do salário e ponto: não se digita nada, só se
   * confere. É o caso do cargo de confiança, em que o adicional é regra fixa
   * do cargo — deixar o campo aberto convidaria a divergir do salário da ficha.
   */
  valorCalculado?: boolean
  /**
   * A base calculada é FIXA (não editável) e o que se digita é um desconto.
   * O valor do mês é `base - desconto`. Sem isto, o campo de valor é livre.
   */
  valorFixo?: boolean
  /**
   * Quem enxerga e opera. Vale para o MENU, a PÁGINA e a ROTA ao mesmo tempo —
   * liberar só o menu deixaria o item visível redirecionando, que é pior do
   * que não mostrar.
   */
  perfis: PerfilLancamento[]
}

export const LANCAMENTOS: Record<TipoLancamento, ConfigLancamento> = {
  'avarias': {
    slug: 'avarias',
    perfis: ['master', 'gestor_rh'],
    titulo: 'Avarias',
    descricao: 'Itens avariados no período, um a um. O desconto do mês é a soma deles.',
    colunas: [],
    temValor: true,
    itensMultiplos: true,
    rotuloDescricao: 'Descrição do item',
  },
  'domingos-feriados': {
    slug: 'domingos-feriados',
    perfis: ['master', 'gestor_rh'],
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
    perfis: ['master', 'gestor_rh'],
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
    perfis: ['master'],
    titulo: 'Gratificação',
    descricao: 'Gratificações do período. Aprovar registra o mês.',
    colunas: [],
    temValor: true,
  },
  'cargo-confianca': {
    slug: 'cargo-confianca',
    perfis: ['master'],
    titulo: 'Cargo de confiança',
    descricao: 'Adicional de 40% sobre o salário, calculado da ficha. Lista só quem tem "Sim" na ficha.',
    colunas: [],
    temValor: true,
    campoFicha: 'cargo_confianca',
    percentualSalario: 0.4,
    valorCalculado: true,
  },
  'insalubridade': {
    slug: 'insalubridade',
    perfis: ['master'],
    titulo: 'Insalubridade',
    descricao: 'Adicional de 20% sobre o salário, calculado da ficha. Lista só quem tem "Sim" na ficha.',
    colunas: [],
    temValor: true,
    campoFicha: 'insalubridade_20',
    percentualSalario: 0.2,
    valorCalculado: true,
  },
  'quebra-caixa': {
    slug: 'quebra-caixa',
    perfis: ['master'],
    titulo: 'Quebra de caixa',
    descricao: 'Base de 15% do salário, menos o desconto do mês. Lista só quem tem "Sim" na ficha.',
    colunas: [],
    temValor: true,
    campoFicha: 'quebra_caixa_15',
    percentualSalario: 0.15,
    valorFixo: true,
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
