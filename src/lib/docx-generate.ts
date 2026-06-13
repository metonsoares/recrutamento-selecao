import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'

/**
 * Remove o "$" que precede variáveis (templates escritos como ${"campo"}),
 * inclusive quando o $ e a { estão em runs XML diferentes do Word.
 */
function stripDollarBeforeTags(zip: PizZip) {
  const targets = Object.keys(zip.files).filter(n =>
    /^word\/(document|header\d*|footer\d*)\.xml$/.test(n)
  )
  for (const name of targets) {
    const xml = zip.file(name)?.asText()
    if (!xml) continue
    const cleaned = xml.replace(/\$((?:<[^>]+>)*\{)/g, '$1')
    if (cleaned !== xml) zip.file(name, cleaned)
  }
}

/** Gera um .docx preenchido a partir do template + variáveis (mantém formatação). */
export async function generateDocxFromTemplate(templateUrl: string, variables: Record<string, string>): Promise<Buffer> {
  const res = await fetch(templateUrl)
  if (!res.ok) throw new Error('Falha ao baixar o template.')
  const buf = Buffer.from(await res.arrayBuffer())
  const zip = new PizZip(buf)
  stripDollarBeforeTags(zip)
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' })
  doc.render(variables)
  return doc.getZip().generate({ type: 'nodebuffer' }) as Buffer
}
