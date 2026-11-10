import { jsPDF } from 'jspdf'
import { formatName } from '@/lib/helpers'

/**
 * Recibo de ciência de quebra/avaria.
 *
 * O texto é o que o dono ditou em 03/11/2026: empresa (razão social e CNPJ da
 * empresa em que o colaborador está registrado), nome, itens, valor do
 * desconto, a declaração, a data em branco e o espaço da assinatura. Data e
 * assinatura ficam em branco de propósito: quem assina é o colaborador, no
 * papel.
 *
 * Um recibo ÚNICO por mês (decisão do dono em 10/11/2026, que substitui a de
 * 03/11, de uma folha por item): os itens vão discriminados numa tabela, com
 * quantidade, valor unitário e valor do item, e o total do período embaixo.
 * Assim o colaborador assina uma vez pelo que foi descontado no mês.
 */

export interface ItemRecibo {
  descricao: string | null
  /** Quantas unidades. Ausente ou 0 vale 1. */
  quantidade?: number
  /** Valor de UMA unidade. Ausente: o próprio valor do item. */
  valorUnitario?: number
  /** Desconto do item (quantidade × unitário). */
  valor: number
}

export interface DadosRecibo {
  razaoSocial: string | null
  cnpj: string | null
  funcionario: string
  /** Todos os itens do mês, discriminados no mesmo recibo. */
  itens: ItemRecibo[]
  /** Período do desconto ("outubro de 2026"). Vai no papel e no nome do arquivo. */
  periodo?: string | null
}

function cnpjFormatado(valor: string | null): string {
  const d = (valor ?? '').replace(/\D/g, '')
  if (d.length !== 14) return valor?.trim() || '—'
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const qtdDe = (i: ItemRecibo) => (i.quantidade && i.quantidade > 0 ? Math.round(i.quantidade) : 1)
const unitarioDe = (i: ItemRecibo) =>
  i.valorUnitario != null && i.valorUnitario > 0
    ? i.valorUnitario
    : Math.round((i.valor / qtdDe(i)) * 100) / 100

/** Nome do arquivo sem o que o sistema de arquivos recusa. */
function nomeDoArquivo(d: DadosRecibo): string {
  const umItem = d.itens.length === 1 ? (d.itens[0].descricao ?? '').trim() : ''
  const partes = ['Recibo de avaria', formatName(d.funcionario), umItem || (d.periodo ?? '').trim()]
  return partes.filter(Boolean).join(' - ').replace(/[\/:*?"<>|]+/g, '-').slice(0, 120) + '.pdf'
}

export function gerarReciboAvaria(d: DadosRecibo) {
  const itens = d.itens.length > 0 ? d.itens : [{ descricao: null, valor: 0 }]
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const larguraPagina = doc.internal.pageSize.getWidth()
  const alturaPagina = doc.internal.pageSize.getHeight()
  const margem = 56
  const largura = larguraPagina - margem * 2

  // Colunas da tabela, da esquerda para a direita.
  const xQtd = margem + largura - 230
  const xUnit = margem + largura - 150
  const xTotal = margem + largura
  const larguraItem = xQtd - margem - 50

  let y = 90

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('RECIBO DE CIÊNCIA DE QUEBRA/AVARIA', larguraPagina / 2, y, { align: 'center' })

  y += 46
  const campo = (rotulo: string, valor: string) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(rotulo, margem, y)
    const recuo = doc.getTextWidth(rotulo) + 6
    doc.setFont('helvetica', 'normal')
    const linhas = doc.splitTextToSize(valor, largura - recuo) as string[]
    doc.text(linhas, margem + recuo, y)
    y += 20 + (linhas.length - 1) * 14
  }

  campo('Empresa:', d.razaoSocial?.trim() || '—')
  campo('CNPJ:', cnpjFormatado(d.cnpj))
  y += 6
  campo('Nome do funcionário:', formatName(d.funcionario))
  if (d.periodo?.trim()) campo('Período:', d.periodo.trim())

  // ── Itens ──────────────────────────────────────────────────────────────
  y += 16
  const cabecalho = () => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('ITEM DANIFICADO', margem, y)
    doc.text('QTD.', xQtd, y, { align: 'right' })
    doc.text('VALOR UNIT.', xUnit, y, { align: 'right' })
    doc.text('VALOR', xTotal, y, { align: 'right' })
    y += 8
    doc.setDrawColor(150)
    doc.line(margem, y, margem + largura, y)
    y += 16
  }
  cabecalho()

  doc.setFontSize(10.5)
  let total = 0
  for (const item of itens) {
    const linhas = doc.splitTextToSize((item.descricao ?? '').trim() || '—', larguraItem) as string[]
    // Sem espaço para a linha, a declaração e a assinatura: vira outra folha.
    if (y + linhas.length * 13 > alturaPagina - 300) {
      doc.addPage()
      y = 90
      cabecalho()
      doc.setFontSize(10.5)
    }
    doc.setFont('helvetica', 'normal')
    doc.text(linhas, margem, y)
    doc.text(String(qtdDe(item)), xQtd, y, { align: 'right' })
    doc.text(brl(unitarioDe(item)), xUnit, y, { align: 'right' })
    doc.text(brl(item.valor), xTotal, y, { align: 'right' })
    total = Math.round((total + item.valor) * 100) / 100
    y += Math.max(18, linhas.length * 13 + 5)
  }

  doc.setDrawColor(150)
  doc.line(margem, y, margem + largura, y)
  y += 20
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11.5)
  doc.text('TOTAL DO DESCONTO', xUnit, y, { align: 'right' })
  doc.text(brl(total), xTotal, y, { align: 'right' })

  // ── Declaração e assinatura ────────────────────────────────────────────
  y += 34
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  const umSo = itens.length === 1
  const declaracao = doc.splitTextToSize(
    umSo
      ? 'Declaro estar ciente da quebra/avaria do item acima descrito e do valor informado pela empresa para desconto em meu contracheque.'
      : 'Declaro estar ciente da quebra/avaria dos itens acima descritos e do valor total informado pela empresa para desconto em meu contracheque.',
    largura,
  ) as string[]
  doc.text(declaracao, margem, y, { lineHeightFactor: 1.6 })
  y += declaracao.length * 18 + 34

  doc.setFont('helvetica', 'bold')
  doc.text('Data:', margem, y)
  doc.setFont('helvetica', 'normal')
  doc.text('______ / ______ / __________', margem + doc.getTextWidth('Data:') + 8, y)

  y += 76
  doc.line(margem, y, margem + 300, y)
  y += 16
  doc.setFontSize(10)
  doc.text('Assinatura do colaborador', margem, y)

  doc.save(nomeDoArquivo(d))
}
