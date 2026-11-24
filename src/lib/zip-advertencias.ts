/**
 * ZIP das advertências, uma pasta por colaborador.
 *
 * Pedido do dono em 24/11/2026: marcar as pessoas no relatório e baixar tudo
 * de uma vez, em vez de abrir advertência por advertência.
 *
 * Roda NO NAVEGADOR de propósito. O arquivo vem do Storage direto para a
 * máquina de quem baixou: passar por uma rota da Vercel esbarraria no corte
 * de ~4,5 MB do corpo da função — um ZIP com dez documentos estoura isso.
 *
 * O compactador é o `pizzip`, que já está no projeto (vem com o
 * docxtemplater) — não precisou de biblioteca nova.
 */

export interface ItemAdvertencia {
  data: string | null
  motivo: string
  file_path: string | null
  file_name: string | null
}

export interface PessoaAdvertencias {
  nome: string
  empresa?: string | null
  cargo?: string | null
  itens: ItemAdvertencia[]
}

/** Tira do nome o que pasta e sistema de arquivos recusam. */
function limpar(nome: string, limite = 80): string {
  return nome
    .replace(/[\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limite) || 'sem-nome'
}

/** dd/mm/aaaa → o arquivo começa pela data em formato que ordena sozinho. */
function prefixoData(data: string | null): string {
  return data && /^\d{4}-\d{2}-\d{2}/.test(data) ? data.slice(0, 10) : 'sem-data'
}

/** Extensão do arquivo guardado (pdf, jpg…); vazio quando não dá para saber. */
function extensao(nome: string | null, caminho: string | null): string {
  const base = (nome || caminho || '').split('?')[0]
  const ext = base.includes('.') ? base.split('.').pop()!.toLowerCase() : ''
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : 'pdf'
}

/**
 * Advertência SEM documento anexado vira um PDF com o que o sistema sabe.
 * Sem isso, a pasta da pessoa sairia faltando uma advertência e ninguém
 * notaria que faltou.
 */
async function pdfDoRegistro(pessoa: PessoaAdvertencias, item: ItemAdvertencia): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margem = 56
  const largura = doc.internal.pageSize.getWidth() - margem * 2
  let y = 90

  doc.setFont('helvetica', 'bold'); doc.setFontSize(14)
  doc.text('REGISTRO DE ADVERTÊNCIA', doc.internal.pageSize.getWidth() / 2, y, { align: 'center' })

  y += 40
  const campo = (rotulo: string, valor: string) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
    doc.text(rotulo, margem, y)
    const recuo = doc.getTextWidth(rotulo) + 6
    doc.setFont('helvetica', 'normal')
    const linhas = doc.splitTextToSize(valor, largura - recuo) as string[]
    doc.text(linhas, margem + recuo, y)
    y += 20 + (linhas.length - 1) * 14
  }
  campo('Colaborador:', pessoa.nome)
  if (pessoa.empresa) campo('Empresa:', pessoa.empresa)
  if (pessoa.cargo) campo('Cargo:', pessoa.cargo)
  campo('Data:', item.data ? item.data.slice(0, 10).split('-').reverse().join('/') : '—')

  y += 6
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
  doc.text('Motivo:', margem, y)
  y += 16
  doc.setFont('helvetica', 'normal')
  const motivo = doc.splitTextToSize(item.motivo || '—', largura) as string[]
  doc.text(motivo, margem, y, { lineHeightFactor: 1.5 })
  y += motivo.length * 17 + 40

  doc.setFontSize(9); doc.setTextColor(120)
  doc.text('Documento gerado pelo sistema a partir do registro — a via assinada não foi anexada.', margem, y)

  return new Uint8Array(doc.output('arraybuffer') as ArrayBuffer)
}

/** Assina e baixa um arquivo do Storage. */
async function baixarDoStorage(path: string): Promise<Uint8Array> {
  const res = await fetch('/api/admin/arquivos/assinar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucket: 'admission-docs', path }),
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok || !d.url) throw new Error(d.error || 'Não foi possível abrir um dos documentos.')
  const arquivo = await fetch(d.url as string)
  if (!arquivo.ok) throw new Error('Falha ao baixar um dos documentos.')
  return new Uint8Array(await arquivo.arrayBuffer())
}

/**
 * Monta o ZIP: uma pasta por pessoa, um arquivo por advertência.
 * Devolve também o que não deu para incluir, para a tela poder avisar em vez
 * de entregar um pacote silenciosamente incompleto.
 */
export async function gerarZipAdvertencias(
  pessoas: PessoaAdvertencias[],
): Promise<{ blob: Blob; arquivos: number; falhas: string[] }> {
  const { default: PizZip } = await import('pizzip')
  const zip = new PizZip()
  const falhas: string[] = []
  let arquivos = 0

  for (const pessoa of pessoas) {
    const pasta = zip.folder(limpar(pessoa.nome))
    const usados = new Set<string>()

    for (const item of pessoa.itens) {
      const base = `${prefixoData(item.data)} - ${limpar(item.motivo || 'advertencia', 60)}`
      try {
        const dados = item.file_path
          ? await baixarDoStorage(item.file_path)
          : await pdfDoRegistro(pessoa, item)
        const ext = item.file_path ? extensao(item.file_name, item.file_path) : 'pdf'
        // Duas advertências no mesmo dia e com o mesmo motivo existiriam com o
        // mesmo nome — a segunda sobrescreveria a primeira dentro do ZIP.
        let nome = `${base}.${ext}`
        let n = 2
        while (usados.has(nome)) nome = `${base} (${n++}).${ext}`
        usados.add(nome)
        pasta.file(nome, dados)
        arquivos += 1
      } catch (e) {
        falhas.push(`${pessoa.nome} — ${base}: ${(e as Error).message}`)
      }
    }
  }

  return { blob: zip.generate({ type: 'blob' }) as Blob, arquivos, falhas }
}
