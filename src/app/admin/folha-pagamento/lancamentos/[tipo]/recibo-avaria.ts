import { jsPDF } from 'jspdf'
import { formatName } from '@/lib/helpers'

/**
 * Recibo de ciência de quebra/avaria.
 *
 * O texto é o que o dono ditou em 03/11/2026: empresa (razão social e CNPJ da
 * empresa em que o colaborador está registrado), nome, item danificado, valor
 * do desconto, a declaração, a data em branco e o espaço da assinatura. Data e
 * assinatura ficam em branco de propósito: quem assina é o colaborador, no
 * papel.
 *
 * Um PDF por MÊS, com uma folha por avaria (decisão do dono no mesmo dia):
 * três avarias no período viram três páginas de um arquivo só, em vez de três
 * downloads.
 */

export interface ItemRecibo {
  descricao: string | null
  valor: number
}

export interface DadosRecibo {
  razaoSocial: string | null
  cnpj: string | null
  funcionario: string
  /** Uma folha para cada item. */
  itens: ItemRecibo[]
  /** Só para o nome do arquivo ("outubro de 2026"). */
  periodo?: string | null
}

function cnpjFormatado(valor: string | null): string {
  const d = (valor ?? '').replace(/\D/g, '')
  if (d.length !== 14) return valor?.trim() || '—'
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Nome do arquivo sem o que o sistema de arquivos recusa. */
function nomeDoArquivo(d: DadosRecibo): string {
  const umItem = d.itens.length === 1 ? (d.itens[0].descricao ?? '').trim() : ''
  const partes = ['Recibo de avaria', formatName(d.funcionario), umItem || (d.periodo ?? '').trim()]
  return partes.filter(Boolean).join(' - ').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 120) + '.pdf'
}

/** Desenha UMA folha — um item por folha. */
function folha(doc: jsPDF, d: DadosRecibo, item: ItemRecibo) {
  const margem = 56
  const largura = doc.internal.pageSize.getWidth() - margem * 2
  let y = 90

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('RECIBO DE CIÊNCIA DE QUEBRA/AVARIA', doc.internal.pageSize.getWidth() / 2, y, { align: 'center' })

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
  campo('Item danificado:', (item.descricao ?? '').trim() || '—')
  campo('Valor do desconto:', brl(item.valor))

  y += 22
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  const declaracao = doc.splitTextToSize(
    'Declaro estar ciente da quebra/avaria do item acima descrito e do valor informado pela empresa para desconto em meu contracheque.',
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
}

export function gerarReciboAvaria(d: DadosRecibo) {
  const itens = d.itens.length > 0 ? d.itens : [{ descricao: null, valor: 0 }]
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })

  itens.forEach((item, i) => {
    if (i > 0) doc.addPage()
    folha(doc, d, item)
  })

  doc.save(nomeDoArquivo(d))
}
