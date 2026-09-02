/**
 * Leitura da folha de pagamento que o CONTADOR devolve em PDF e conferência
 * contra o que a empresa aprovou aqui.
 *
 * O PDF não tem estrutura de dados — só texto posicionado. O que dá firmeza é
 * a POSIÇÃO horizontal: o cabeçalho define as colunas ("Adicionais" ~x330,
 * "Descontos" ~x403), então o mesmo número significa provento ou desconto
 * conforme onde ele cai. Ler só o texto corrido perderia isso.
 */

/** Um pedaço de texto do PDF, com o x em que começa. */
export interface PedacoPdf { x: number; s: string }
/** Uma linha do PDF: pedaços já ordenados da esquerda para a direita. */
export interface LinhaPdf { itens: PedacoPdf[] }

export interface RubricaContador {
  codigo: string
  descricao: string
  /** "220:00", "30", "" — como veio */
  referencia: string
  valor: number
  tipo: 'provento' | 'desconto'
}

export interface FuncionarioContador {
  codigo: string
  nome: string
  funcao: string | null
  admissao: string | null
  /** Salário contratual impresso ao lado do nome. */
  salarioContratual: number
  rubricas: RubricaContador[]
  totalProventos: number
  totalDescontos: number
  liquido: number
}

export interface FolhaContador {
  empresa: string | null
  cnpj: string | null
  periodoInicio: string | null
  periodoFim: string | null
  funcionarios: FuncionarioContador[]
  totalGeral: number
  totalDescontos: number
  totalLiquido: number
}

/** "1.892,34" → 1892.34 */
export function valorBr(t: string): number {
  const limpo = String(t).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
  const n = Number(limpo)
  return Number.isFinite(n) ? n : 0
}

const EH_VALOR = /^\*{0,20}[\d.]*\d,\d{2}\*{0,20}$/

// ─── Leitura ──────────────────────────────────────────────────────────────────

/**
 * Onde começa a coluna de descontos. Sai do cabeçalho quando ele existe; o
 * padrão cobre o layout usado hoje pelo escritório.
 */
function limiteDesconto(linhas: LinhaPdf[]): number {
  for (const l of linhas) {
    const desc = l.itens.find(i => /^Descontos$/i.test(i.s.trim()))
    if (desc) return desc.x - 25
    }
  return 380
}

export function lerFolhaContador(linhas: LinhaPdf[]): FolhaContador {
  const corteDesconto = limiteDesconto(linhas)
  const folha: FolhaContador = {
    empresa: null, cnpj: null, periodoInicio: null, periodoFim: null,
    funcionarios: [], totalGeral: 0, totalDescontos: 0, totalLiquido: 0,
  }
  let atual: FuncionarioContador | null = null

  for (const linha of linhas) {
    const texto = linha.itens.map(i => i.s).join(' ').replace(/\s+/g, ' ').trim()

    // ── Cabeçalho do documento ──
    if (!folha.empresa && /^Empresa\s*:/i.test(texto)) {
      folha.empresa = linha.itens[1]?.s?.trim() ?? null
    }
    if (!folha.cnpj) {
      const m = texto.match(/CNPJ\/CEI:\s*(\d{11,14})/i)
      if (m) folha.cnpj = m[1]
    }
    if (!folha.periodoInicio) {
      const m = texto.match(/Ref\.?:?\s*(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})/i)
      if (m) { folha.periodoInicio = m[1]; folha.periodoFim = m[2] }
    }

    // ── Início de um funcionário: código de 6 dígitos + nome ──
    const inicio = texto.match(/^(\d{6})\s+(.+?)\s+([\d.]*\d,\d{2})\s+Fun[çc][ãa]o\s*:?\s*(.*?)(?:\s+Livro|$)/i)
    if (inicio) {
      if (atual) folha.funcionarios.push(atual)
      atual = {
        codigo: inicio[1],
        nome: inicio[2].trim(),
        salarioContratual: valorBr(inicio[3]),
        funcao: inicio[4]?.trim() || null,
        admissao: null,
        rubricas: [],
        totalProventos: 0, totalDescontos: 0, liquido: 0,
      }
      continue
    }
    if (!atual) continue

    const adm = texto.match(/Admiss[ãa]o\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i)
    if (adm) { atual.admissao = adm[1]; continue }

    // ── Rubrica: código de 3 dígitos, descrição, referência opcional, valor ──
    const codigo = linha.itens[0]
    if (codigo && /^\d{3}$/.test(codigo.s.trim()) && codigo.x < 60) {
      const valorItem = [...linha.itens].reverse().find(i => EH_VALOR.test(i.s.trim()))
      if (valorItem) {
        const meio = linha.itens.slice(1, linha.itens.indexOf(valorItem))
        const referencia = meio.find(i => /^\d+[:,.]?\d*$/.test(i.s.trim()) && i.x > 150)?.s.trim() ?? ''
        const descricao = meio
          .filter(i => i.s.trim() !== referencia)
          .map(i => i.s)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
        atual.rubricas.push({
          codigo: codigo.s.trim(),
          descricao,
          referencia,
          valor: valorBr(valorItem.s),
          tipo: valorItem.x >= corteDesconto ? 'desconto' : 'provento',
        })
      }
      continue
    }

    // ── Fecho do funcionário: proventos, descontos e líquido na mesma linha ──
    const valores = linha.itens.filter(i => EH_VALOR.test(i.s.trim()))
    if (valores.length >= 2 && !texto.includes('Base ') && atual.rubricas.length > 0 && !atual.liquido) {
      atual.totalProventos = valorBr(valores[0].s)
      atual.totalDescontos = valores.length >= 3 ? valorBr(valores[1].s) : 0
      atual.liquido = valorBr(valores[valores.length - 1].s)
    }

    // ── Resumo geral ──
    // A linha do resumo carrega DUAS colunas ("Total Geral da Folha … 4.905,22"
    // e "Total Funcionários 2"): vale o primeiro valor da coluna da esquerda.
    const valorEsquerda = () => {
      const item = linha.itens.find(i => i.x < 300 && EH_VALOR.test(i.s.trim()))
      return item ? valorBr(item.s) : 0
    }
    if (/Total Geral da Folha/i.test(texto)) folha.totalGeral = valorEsquerda()
    if (/\(\s*-\s*\)\s*Total de Descontos/i.test(texto)) folha.totalDescontos = valorEsquerda()
    if (/\(\s*=\s*\)\s*Total L[íi]quido/i.test(texto)) folha.totalLiquido = valorEsquerda()
  }
  if (atual) folha.funcionarios.push(atual)
  return folha
}

// ─── Conferência ──────────────────────────────────────────────────────────────

/** O que a nossa folha aprovada diz de um colaborador. */
export interface LinhaNossa {
  nome: string
  salario: number
  gorjeta: number
  vale_transporte: boolean | null
  mensalidade_sindical: boolean | null
  faltas: number
  insalubridade_20: boolean | null
  confianca_valor: number
  quebra_valor: number
  gratificacao: number
  adiantamento: number
  avarias: number
  horas_extras: boolean
  adicional_noturno: boolean
}

export interface Divergencia {
  campo: string
  nosso: string
  contador: string
  /** alta = número diferente ou pessoa faltando; media = presença/ausência de rubrica. */
  gravidade: 'alta' | 'media'
}

export interface ConferenciaPessoa {
  nome: string
  situacao: 'ok' | 'divergente' | 'so_nosso' | 'so_contador'
  divergencias: Divergencia[]
  /** Referência do contador, quando encontrada. */
  codigoContador?: string
  liquido?: number
}

export interface Conferencia {
  empresa: string | null
  periodo: string | null
  pessoas: ConferenciaPessoa[]
  totalDivergencias: number
  conferidos: number
  soNosso: number
  soContador: number
  /** Somas comparáveis dos dois lados. */
  totais: { rotulo: string; nosso: number; contador: number }[]
}

/** Nome sem acento, sem pontuação e em maiúsculas — para casar as duas listas. */
function chaveNome(n: string): string {
  return String(n ?? '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Za-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

const PADROES = {
  salario: /sal[áa]rio\s*base|sal\.?\s*base/i,
  gorjeta: /gorjeta/i,
  vale_transporte: /vale\s*transporte|vale-transporte|\bv\.?t\.?\b/i,
  sindical: /sindical|contrib.*sind/i,
  faltas: /falta|d\.?s\.?r\.?\s*sobre\s*falta/i,
  insalubridade: /insalubr/i,
  confianca: /confian[çc]a|gratifica[çc][ãa]o\s*de\s*fun[çc][ãa]o/i,
  quebra: /quebra\s*de\s*caixa/i,
  gratificacao: /gratifica[çc][ãa]o(?!\s*de\s*fun)/i,
  adiantamento: /adiantamento/i,
  avarias: /avaria|desconto\s*de\s*danos/i,
  horas_extras: /hora[s]?\s*extra|\bh\.?e\.?\b/i,
  noturno: /noturn/i,
}

const CENTAVO = 0.02

/** Compara a nossa folha aprovada com a folha do contador. */
export function conferirFolha(nossas: LinhaNossa[], folha: FolhaContador): Conferencia {
  const porNome = new Map(folha.funcionarios.map(f => [chaveNome(f.nome), f]))
  const usados = new Set<string>()
  const pessoas: ConferenciaPessoa[] = []

  const tem = (f: FuncionarioContador, re: RegExp) => f.rubricas.some(r => re.test(r.descricao))
  const somaDe = (f: FuncionarioContador, re: RegExp) =>
    f.rubricas.filter(r => re.test(r.descricao)).reduce((s, r) => s + r.valor, 0)

  for (const n of nossas) {
    const chave = chaveNome(n.nome)
    const f = porNome.get(chave)
    if (!f) {
      pessoas.push({
        nome: n.nome, situacao: 'so_nosso',
        divergencias: [{ campo: 'Presença na folha', nosso: 'aprovado aqui', contador: 'não consta', gravidade: 'alta' }],
      })
      continue
    }
    usados.add(chave)

    const d: Divergencia[] = []
    const compararValor = (campo: string, nosso: number, contador: number, gravidade: Divergencia['gravidade'] = 'alta') => {
      if (Math.abs(nosso - contador) > CENTAVO) {
        d.push({ campo, nosso: brl(nosso), contador: brl(contador), gravidade })
      }
    }
    const compararPresenca = (campo: string, nosso: boolean, contador: boolean, valorContador?: number) => {
      if (nosso === contador) return
      d.push({
        campo,
        nosso: nosso ? 'sim' : 'não',
        contador: contador ? (valorContador ? brl(valorContador) : 'sim') : 'não consta',
        gravidade: 'media',
      })
    }

    // O salário base do contador tem que ser o da ficha; é a raiz de tudo.
    const salarioContador = somaDe(f, PADROES.salario) || f.salarioContratual
    if (n.salario > 0) compararValor('Salário base', n.salario, salarioContador)

    if (n.gorjeta > 0 || tem(f, PADROES.gorjeta)) {
      compararValor('Gorjeta', n.gorjeta, somaDe(f, PADROES.gorjeta))
    }
    compararPresenca('Vale transporte', n.vale_transporte === true, tem(f, PADROES.vale_transporte), somaDe(f, PADROES.vale_transporte))
    compararPresenca('Mensalidade sindical', n.mensalidade_sindical === true, tem(f, PADROES.sindical))
    compararPresenca('Faltas', n.faltas > 0, tem(f, PADROES.faltas))
    compararPresenca('Insalubridade', n.insalubridade_20 === true, tem(f, PADROES.insalubridade))
    compararPresenca('Horas extras', n.horas_extras, tem(f, PADROES.horas_extras))
    compararPresenca('Adicional noturno', n.adicional_noturno, tem(f, PADROES.noturno))

    if (n.confianca_valor > 0 || tem(f, PADROES.confianca)) {
      compararValor('Cargo de confiança', n.confianca_valor, somaDe(f, PADROES.confianca))
    }
    if (n.quebra_valor > 0 || tem(f, PADROES.quebra)) {
      compararValor('Quebra de caixa', n.quebra_valor, somaDe(f, PADROES.quebra))
    }
    if (n.gratificacao > 0) compararValor('Gratificação', n.gratificacao, somaDe(f, PADROES.gratificacao))
    if (n.adiantamento > 0) compararValor('Adiantamento salarial', n.adiantamento, somaDe(f, PADROES.adiantamento))
    if (n.avarias > 0) compararValor('Avarias', n.avarias, somaDe(f, PADROES.avarias))

    pessoas.push({
      nome: n.nome,
      situacao: d.length ? 'divergente' : 'ok',
      divergencias: d,
      codigoContador: f.codigo,
      liquido: f.liquido,
    })
  }

  // Quem está na folha do contador e não na nossa.
  for (const f of folha.funcionarios) {
    if (usados.has(chaveNome(f.nome))) continue
    pessoas.push({
      nome: f.nome,
      situacao: 'so_contador',
      codigoContador: f.codigo,
      liquido: f.liquido,
      divergencias: [{ campo: 'Presença na folha', nosso: 'não aprovado aqui', contador: 'consta na folha', gravidade: 'alta' }],
    })
  }

  const somaNossa = (f: (l: LinhaNossa) => number) => nossas.reduce((s, l) => s + f(l), 0)
  const somaContador = (re: RegExp) =>
    folha.funcionarios.reduce((s, f) => s + f.rubricas.filter(r => re.test(r.descricao)).reduce((t, r) => t + r.valor, 0), 0)

  return {
    empresa: folha.empresa,
    periodo: folha.periodoInicio && folha.periodoFim ? `${folha.periodoInicio} a ${folha.periodoFim}` : null,
    pessoas: pessoas.sort((a, b) => {
      const peso = { so_contador: 0, so_nosso: 1, divergente: 2, ok: 3 }
      return peso[a.situacao] - peso[b.situacao] || a.nome.localeCompare(b.nome, 'pt-BR')
    }),
    conferidos: pessoas.filter(p => p.situacao === 'ok' || p.situacao === 'divergente').length,
    totalDivergencias: pessoas.reduce((s, p) => s + p.divergencias.length, 0),
    soNosso: pessoas.filter(p => p.situacao === 'so_nosso').length,
    soContador: pessoas.filter(p => p.situacao === 'so_contador').length,
    totais: [
      { rotulo: 'Colaboradores', nosso: nossas.length, contador: folha.funcionarios.length },
      { rotulo: 'Salários base', nosso: somaNossa(l => l.salario), contador: somaContador(PADROES.salario) },
      { rotulo: 'Gorjetas', nosso: somaNossa(l => l.gorjeta), contador: somaContador(PADROES.gorjeta) },
    ],
  }
}

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
