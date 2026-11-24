/**
 * Lista dos documentos para contratação, em PDF, para entregar ao candidato.
 *
 * Pedido do dono em 24/11/2026. Sai da MESMA fonte da Ficha de Admissão
 * (`DOCS_FICHA`), que é a lista que o RH confere em "Documentos entregues" —
 * assim o papel e o sistema nunca cobram coisas diferentes.
 *
 * Documento que só vale para alguns casos (filho menor, pensão judicial) sai
 * com a condição ao lado: a lista crua faria a pessoa procurar certidão de
 * filho que não tem.
 */
import { DOCS_FICHA } from './documentos-defs'

/** A frase que o dono pediu no topo. */
const AVISO = 'Deve ser enviada cópia de todos os documentos.'

export const NOME_LISTA_DOCUMENTOS = 'Listagem de documentos para contratacao.pdf'

/** Quando o documento não é para todo mundo, a condição vai junto. */
function condicao(key: string, perChild?: boolean): string {
  if (key === 'pensao_alimenticia') return 'somente se houver decisão judicial de pensão'
  if (key === 'certificado_reservista') return 'somente para homens'
  if (perChild) return 'para cada filho menor de 14 anos'
  return ''
}

export async function gerarListaDocumentosPdf(): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })

  const margem = 48
  const largura = doc.internal.pageSize.getWidth() - margem * 2
  const alturaPagina = doc.internal.pageSize.getHeight()
  let y = 56

  // ── Cabeçalho ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(20, 48, 37) // verde escuro da marca
  doc.text('LISTAGEM DE DOCUMENTOS PARA CONTRATAÇÃO', doc.internal.pageSize.getWidth() / 2, y, { align: 'center' })

  y += 22
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(40)
  doc.text(AVISO, doc.internal.pageSize.getWidth() / 2, y, { align: 'center' })

  // ── Nome e data, para o papel não virar anônimo ──
  y += 26
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(110)
  doc.text('NOME', margem, y)
  doc.text('DATA', margem + largura - 150, y)
  doc.setDrawColor(190)
  doc.roundedRect(margem, y + 4, largura - 160, 20, 3, 3)
  doc.roundedRect(margem + largura - 150, y + 4, 150, 20, 3, 3)
  y += 44

  // ── Lista ──
  doc.setDrawColor(210)
  doc.line(margem, y, margem + largura, y)
  y += 20

  for (const d of DOCS_FICHA) {
    if (y > alturaPagina - 110) { doc.addPage(); y = 56 }

    // Quadradinho para marcar o que já foi entregue.
    doc.setDrawColor(130)
    doc.rect(margem, y - 9, 11, 11)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(30)
    doc.text(d.label, margem + 20, y)

    const obs = condicao(d.key, d.perChild)
    if (obs) {
      doc.setFontSize(9)
      doc.setTextColor(120)
      doc.text(`(${obs})`, margem + 22 + doc.getTextWidth(d.label), y)
    }
    y += 24
  }

  // ── Rodapé ──
  if (y > alturaPagina - 90) { doc.addPage(); y = 56 }
  y += 10
  doc.setDrawColor(210)
  doc.line(margem, y, margem + largura, y)
  y += 18
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(110)
  const nota = doc.splitTextToSize(
    'Entregue as cópias ao RH. Documento que não se aplica ao seu caso pode ser deixado em branco — '
    + 'a empresa confere a lista na admissão.',
    largura,
  ) as string[]
  doc.text(nota, margem, y, { lineHeightFactor: 1.5 })

  return doc.output('blob')
}
