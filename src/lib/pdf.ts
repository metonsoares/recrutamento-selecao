// Geração de PDF de tabela (jspdf + autotable, já nas dependências).
// Import dinâmico: a biblioteca é pesada e só carrega quando o usuário exporta.

type Celula = string | number | null | undefined

export async function gerarPdfTabela({
  titulo, subtitulo, cabecalho, linhas, paisagem = false,
}: {
  titulo: string
  subtitulo?: string
  cabecalho: string[]
  linhas: Celula[][]
  paisagem?: boolean
}): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])

  const doc = new jsPDF({ orientation: paisagem ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' })

  doc.setFontSize(15)
  doc.setTextColor(20, 48, 37) // verde escuro da marca
  doc.text(titulo, 40, 46)

  if (subtitulo) {
    doc.setFontSize(9.5)
    doc.setTextColor(110)
    doc.text(subtitulo, 40, 62)
  }

  autoTable(doc, {
    head: [cabecalho],
    body: linhas.map(l => l.map(c => (c === null || c === undefined ? '' : String(c)))),
    startY: subtitulo ? 76 : 60,
    styles: { fontSize: 9, cellPadding: 5, overflow: 'linebreak' },
    headStyles: { fillColor: [31, 67, 50], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [246, 248, 247] },
    margin: { left: 40, right: 40 },
  })

  return doc.output('blob')
}

/** Uma seção do PDF por colaborador: título e as linhas dela. */
export interface SecaoFolha {
  titulo: string
  linhas: { rotulo: string; valores: string[] }[]
}

/**
 * PDF da folha "de pé": os campos viram LINHAS e cada colaborador vira uma
 * COLUNA — que é como se confere folha no papel, campo a campo.
 *
 * A tabela deitada só cabia em paisagem e ainda assim espremia; assim cabem
 * poucos colaboradores por página, mas cada um legível. As seções separam
 * jornada, descontos e adicionais, e a coluna dos rótulos se repete a cada
 * bloco de colaboradores.
 */
export async function gerarPdfFolhaVertical({
  titulo, subtitulo, colaboradores, secoes, totais, porPagina = 5,
}: {
  titulo: string
  subtitulo?: string
  colaboradores: string[]
  secoes: SecaoFolha[]
  /** Fecho da empresa, impresso uma vez ao fim da última página. */
  totais?: { rotulo: string; valor: string }[]
  porPagina?: number
}): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const VERDE: [number, number, number] = [31, 67, 50]

  for (let inicio = 0; inicio < colaboradores.length; inicio += porPagina) {
    const fatia = colaboradores.slice(inicio, inicio + porPagina)
    const indices = fatia.map((_, i) => inicio + i)
    if (inicio > 0) doc.addPage()

    doc.setFontSize(15)
    doc.setTextColor(...VERDE)
    doc.text(titulo, 40, 46)
    if (subtitulo) {
      doc.setFontSize(9.5)
      doc.setTextColor(110)
      doc.text(subtitulo, 40, 62)
    }

    // Corpo: cada seção entra como uma linha-título seguida das suas linhas.
    const corpo: string[][] = []
    const linhasDeSecao: number[] = []
    // Todas as linhas, mesmo vazias: a folha tem sempre a mesma cara e o campo
    // em branco é onde se escreve à mão na conferência.
    for (const s of secoes) {
      linhasDeSecao.push(corpo.length)
      corpo.push([s.titulo, ...fatia.map(() => '')])
      for (const l of s.linhas) corpo.push([l.rotulo, ...indices.map(i => l.valores[i] ?? '')])
    }

    autoTable(doc, {
      head: [['', ...fatia]],
      body: corpo,
      startY: subtitulo ? 76 : 60,
      styles: { fontSize: 8.5, cellPadding: 4, overflow: 'linebreak', lineColor: [225, 230, 227], lineWidth: 0.5 },
      headStyles: { fillColor: VERDE, textColor: 255, fontStyle: 'bold', halign: 'center', valign: 'middle' },
      columnStyles: {
        0: { cellWidth: 132, fontStyle: 'bold', textColor: [55, 65, 60] },
        ...Object.fromEntries(fatia.map((_, i) => [i + 1, { halign: 'right' as const }])),
      },
      margin: { left: 40, right: 40 },
      didParseCell: data => {
        if (data.section !== 'body') return
        if (linhasDeSecao.includes(data.row.index)) {
          data.cell.styles.fillColor = [237, 243, 240]
          data.cell.styles.textColor = VERDE
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.halign = 'left'
        }
      },
    })
  }

  if (totais && totais.length > 0) {
    // O fecho vai embaixo da última página, aproveitando o espaço que sobra.
    const y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 90
    autoTable(doc, {
      head: [['Totais da empresa', '']],
      body: totais.map(t => [t.rotulo, t.valor]),
      startY: y + 22,
      tableWidth: 300,
      styles: { fontSize: 8.5, cellPadding: 4, lineColor: [225, 230, 227], lineWidth: 0.5 },
      headStyles: { fillColor: VERDE, textColor: 255, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 180 }, 1: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: 40, right: 40 },
    })
  }

  return doc.output('blob')
}
