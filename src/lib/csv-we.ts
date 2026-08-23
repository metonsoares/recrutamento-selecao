/**
 * Leitor do CSV da WE Benefícios (relatório de compras / prévia da compra).
 *
 * O cabeçalho observado na plataforma é:
 *   Matrícula · CPF · Funcionário · Depto[Cód Depto] · Benefício · Oper. ·
 *   Linha · Quant · Quant Diária · Tarifa (R$) · Valor (R$)
 *
 * Como o layout pode mudar entre o "Relatório de Compras Unificado" e a
 * "Prévia da Compra", as colunas são reconhecidas pelo NOME e não pela posição.
 * Assim uma coluna a mais no arquivo não quebra a importação.
 */

export interface LinhaPassagem {
  cpf: string
  nome: string | null
  quantidade: number
  valor: number
  pedido: string | null
}

export interface LeituraCsv {
  linhas: LinhaPassagem[]
  cabecalho: string[]
  /** Nome da coluna que foi usada para cada campo — mostrado na tela. */
  colunas: { cpf?: string; nome?: string; quantidade?: string; valor?: string; pedido?: string }
  ignoradas: number
}

/** Tira acento e caixa, para comparar cabeçalho sem depender de grafia. */
function chave(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Divide uma linha de CSV respeitando aspas. */
function dividir(linha: string, sep: string): string[] {
  const campos: string[] = []
  let atual = ''
  let dentroDeAspas = false
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]
    if (c === '"') {
      if (dentroDeAspas && linha[i + 1] === '"') { atual += '"'; i++ }
      else dentroDeAspas = !dentroDeAspas
    } else if (c === sep && !dentroDeAspas) {
      campos.push(atual); atual = ''
    } else {
      atual += c
    }
  }
  campos.push(atual)
  return campos.map(c => c.trim().replace(/^"|"$/g, ''))
}

/** O separador é o que mais aparece na linha de cabeçalho. */
function detectarSeparador(linha: string): string {
  const cand = [';', ',', '\t']
  return cand.map(s => ({ s, n: linha.split(s).length })).sort((a, b) => b.n - a.n)[0].s
}

/** Acha o índice da coluna cujo nome casa com um dos apelidos. */
function acharColuna(cab: string[], apelidos: string[]): number {
  const chaves = cab.map(chave)
  for (const a of apelidos) {
    const alvo = chave(a)
    const exato = chaves.indexOf(alvo)
    if (exato >= 0) return exato
  }
  for (const a of apelidos) {
    const alvo = chave(a)
    const parcial = chaves.findIndex(c => c.includes(alvo))
    if (parcial >= 0) return parcial
  }
  return -1
}

export function lerCsvWe(texto: string): LeituraCsv {
  // Remove BOM e linhas vazias.
  const linhasBrutas = texto.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim() !== '')
  if (linhasBrutas.length === 0) {
    return { linhas: [], cabecalho: [], colunas: {}, ignoradas: 0 }
  }

  // O relatório às vezes vem com linhas de título antes do cabeçalho: o
  // cabeçalho de verdade é a primeira linha que tem uma coluna de CPF.
  let iCab = 0
  let sep = detectarSeparador(linhasBrutas[0])
  for (let i = 0; i < Math.min(linhasBrutas.length, 15); i++) {
    const s = detectarSeparador(linhasBrutas[i])
    if (acharColuna(dividir(linhasBrutas[i], s), ['cpf']) >= 0) { iCab = i; sep = s; break }
  }

  const cabecalho = dividir(linhasBrutas[iCab], sep)
  const iCpf = acharColuna(cabecalho, ['cpf'])
  const iNome = acharColuna(cabecalho, ['funcionario', 'colaborador', 'nome'])
  // "Quant" é a quantidade comprada; "Quant Diária" é passagens por dia — não
  // servem para a mesma coisa, então a diária nunca pode ser escolhida aqui.
  const iQtd = acharColuna(
    cabecalho.map(c => (chave(c).includes('diaria') ? '—' : c)),
    ['quant', 'quantidade', 'qtd', 'passagens'],
  )
  const iValor = acharColuna(cabecalho, ['valorrs', 'valor', 'total'])
  const iPedido = acharColuna(cabecalho, ['pedido', 'numerodopedido', 'ordem'])

  const linhas: LinhaPassagem[] = []
  let ignoradas = 0

  for (let i = iCab + 1; i < linhasBrutas.length; i++) {
    const campos = dividir(linhasBrutas[i], sep)
    const cpf = iCpf >= 0 ? String(campos[iCpf] ?? '').replace(/\D/g, '') : ''
    if (cpf.length < 11 || Number(cpf) === 0) { ignoradas++; continue }
    linhas.push({
      cpf: cpf.padStart(11, '0').slice(-11),
      nome: iNome >= 0 ? (campos[iNome] || null) : null,
      quantidade: iQtd >= 0 ? Number(String(campos[iQtd] ?? '').replace(/\D/g, '')) || 0 : 0,
      valor: iValor >= 0 ? valorBr(campos[iValor]) : 0,
      pedido: iPedido >= 0 ? (campos[iPedido] || null) : null,
    })
  }

  return {
    linhas,
    cabecalho,
    colunas: {
      cpf: iCpf >= 0 ? cabecalho[iCpf] : undefined,
      nome: iNome >= 0 ? cabecalho[iNome] : undefined,
      quantidade: iQtd >= 0 ? cabecalho[iQtd] : undefined,
      valor: iValor >= 0 ? cabecalho[iValor] : undefined,
      pedido: iPedido >= 0 ? cabecalho[iPedido] : undefined,
    },
    ignoradas,
  }
}

function valorBr(v: string | undefined): number {
  const s = String(v ?? '').replace(/[^\d,.-]/g, '')
  if (!s) return 0
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}
