// Geração de PDF de tabela (jspdf + autotable, já nas dependências).
// Import dinâmico: a biblioteca é pesada e só carrega quando o usuário exporta.

type Celula = string | number | null | undefined

export async function gerarPdfTabela({
  titulo, subtitulo, cabecalho, linhas, paisagem = false, compacto = false, alinhamentos,
}: {
  titulo: string
  subtitulo?: string
  cabecalho: string[]
  linhas: Celula[][]
  paisagem?: boolean
  /** Tabela com muitas colunas: fonte e respiro menores para o valor não
   *  quebrar em duas linhas ("R$ 1.892,34" partido no meio). */
  compacto?: boolean
  /** Alinhamento de cada coluna; o padrão do autotable é à esquerda. */
  alinhamentos?: ('left' | 'center' | 'right')[]
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
    styles: { fontSize: compacto ? 7.5 : 9, cellPadding: compacto ? 3.5 : 5, overflow: 'linebreak' },
    headStyles: { fillColor: [31, 67, 50], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [246, 248, 247] },
    columnStyles: Object.fromEntries(
      (alinhamentos ?? []).map((a, i) => [i, { halign: a }]),
    ),
    margin: { left: 40, right: 40 },
  })

  return doc.output('blob')
}
