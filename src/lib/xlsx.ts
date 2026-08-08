import PizZip from 'pizzip'

// Gera um .xlsx real (OOXML) sem dependência extra — o projeto já usa pizzip.
// Usa inlineStr para texto, evitando a tabela de sharedStrings.

type Celula = string | number | null | undefined

function escapar(v: string): string {
  return v
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Remove caracteres de controle que invalidam o XML
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
}

/** Referência da coluna: 0 → A, 25 → Z, 26 → AA. */
function coluna(i: number): string {
  let s = ''
  let n = i
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1 } while (n >= 0)
  return s
}

function celulaXml(ref: string, valor: Celula, negrito: boolean): string {
  const estilo = negrito ? ' s="1"' : ''
  if (valor === null || valor === undefined || valor === '') return `<c r="${ref}"${estilo}/>`
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    return `<c r="${ref}"${estilo}><v>${valor}</v></c>`
  }
  return `<c r="${ref}"${estilo} t="inlineStr"><is><t xml:space="preserve">${escapar(String(valor))}</t></is></c>`
}

/**
 * Monta a planilha e devolve um Blob pronto para download.
 * A primeira linha é tratada como cabeçalho (negrito).
 */
export function gerarXlsx(linhas: Celula[][], nomeAba = 'Planilha1'): Blob {
  const linhasXml = linhas.map((linha, i) => {
    const celulas = linha
      .map((valor, j) => celulaXml(`${coluna(j)}${i + 1}`, valor, i === 0))
      .join('')
    return `<row r="${i + 1}">${celulas}</row>`
  }).join('')

  const larguras = (linhas[0] ?? []).map((_, j) => `<col min="${j + 1}" max="${j + 1}" width="28" customWidth="1"/>`).join('')

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cols>${larguras}</cols><sheetData>${linhasXml}</sheetData></worksheet>`

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${escapar(nomeAba).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>`

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="1"><fill><patternFill patternType="none"/></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="2"><xf xfId="0"/><xf xfId="0" fontId="1" applyFont="1"/></cellXfs>
</styleSheet>`

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

  const zip = new PizZip()
  zip.file('[Content_Types].xml', contentTypes)
  zip.folder('_rels')!.file('.rels', rels)
  const xl = zip.folder('xl')!
  xl.file('workbook.xml', workbook)
  xl.file('styles.xml', styles)
  xl.folder('_rels')!.file('workbook.xml.rels', workbookRels)
  xl.folder('worksheets')!.file('sheet1.xml', sheet)

  return zip.generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }) as Blob
}

/** Dispara o download de um Blob no navegador. */
export function baixarArquivo(blob: Blob, nomeArquivo: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
