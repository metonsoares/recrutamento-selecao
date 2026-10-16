import 'server-only'
import { lerFolhaContador, valorBr, type LinhaPdf } from '@/lib/folha-contador'

/**
 * Leitura de PDFs de RH para a ponte do ChatGPT — sem alterar o original.
 *
 * Três situações reais no acervo:
 *  1. PDF com texto nativo (gerado pelo sistema do contador): confiável.
 *  2. PDF digitalizado COM camada de OCR do scanner (os "Image_00X.pdf"): há
 *     texto, mas com erros de reconhecimento e na ordem do fluxo (descrições
 *     num bloco, valores noutro). Remontamos as linhas pela POSIÇÃO na página
 *     e marcamos a origem como OCR — o valor precisa ser conferido na imagem.
 *  3. PDF só imagem: não há texto. Devolvemos a imagem da página (JPEG
 *     embutido, extraído byte a byte, sem recompressão) quando pedido.
 * Nenhum OCR é feito aqui e nada é enviado a terceiros por esta camada.
 */

export type OrigemTexto = 'nativo' | 'ocr_do_scanner' | 'ocr_servidor' | 'sem_texto'

export interface PaginaLida {
  pagina: number
  /** Linhas remontadas pela posição (y), da esquerda para a direita. */
  linhas: string[]
}

export interface PdfLido {
  totalPaginas: number
  origem: OrigemTexto
  paginas: PaginaLida[]
  /** Linhas com posição, para os leitores estruturados. */
  posicionadas: LinhaPdf[][]
  temImagens: boolean
}

const LIMITE_PAGINAS = 40

/** JPEGs embutidos (/DCTDecode), na ordem do arquivo — 1 por página nos scanners. */
export function extrairJpegs(bytes: Uint8Array, max = 12): Uint8Array[] {
  const buf = Buffer.from(bytes)
  const out: Uint8Array[] = []
  let pos = 0
  while (out.length < max) {
    const i = buf.indexOf('/DCTDecode', pos)
    if (i < 0) break
    const s = buf.indexOf('stream', i)
    if (s < 0) break
    let ini = s + 6
    if (buf[ini] === 0x0d) ini++
    if (buf[ini] === 0x0a) ini++
    const fim = buf.indexOf('endstream', ini)
    if (fim < 0) break
    let f = fim
    while (f > ini && (buf[f - 1] === 0x0a || buf[f - 1] === 0x0d)) f--
    const jpg = buf.subarray(ini, f)
    // Só JPEG de verdade (SOI) e maior que um ícone/logotipo.
    if (jpg.length > 15_000 && jpg[0] === 0xff && jpg[1] === 0xd8) out.push(new Uint8Array(jpg))
    pos = fim + 9
  }
  return out
}

export async function lerPdf(bytes: Uint8Array): Promise<PdfLido> {
  const { getDocumentProxy } = await import('unpdf')
  const temImagens = extrairJpegs(bytes, 1).length > 0
  const pdf = await getDocumentProxy(new Uint8Array(bytes))
  const paginas: PaginaLida[] = []
  const posicionadas: LinhaPdf[][] = []
  let caracteres = 0
  const total = pdf.numPages
  for (let p = 1; p <= Math.min(total, LIMITE_PAGINAS); p++) {
    const conteudo = await (await pdf.getPage(p)).getTextContent()
    // Agrupa por linha (y, com tolerância de 2pt) guardando o x de cada pedaço.
    const porY: { y: number; itens: { x: number; s: string }[] }[] = []
    for (const item of conteudo.items) {
      const t = item as { str?: string; transform?: number[] }
      if (!t.str?.trim() || !t.transform) continue
      const y = Math.round(t.transform[5])
      const x = Math.round(t.transform[4])
      let linha = porY.find(l => Math.abs(l.y - y) <= 2)
      if (!linha) { linha = { y, itens: [] }; porY.push(linha) }
      linha.itens.push({ x, s: t.str })
      caracteres += t.str.trim().length
    }
    porY.sort((a, b) => b.y - a.y)
    const linhas = porY.map(l => ({ itens: l.itens.sort((a, b) => a.x - b.x) }))
    posicionadas.push(linhas)
    paginas.push({
      pagina: p,
      linhas: linhas.map(l => l.itens.map(i => i.s.trim()).join('  ')).filter(Boolean),
    })
  }
  const origem: OrigemTexto = caracteres < 20 ? 'sem_texto' : temImagens ? 'ocr_do_scanner' : 'nativo'
  return { totalPaginas: total, origem, paginas, posicionadas, temImagens }
}

// ---------------------------------------------------------------------------
// Contracheque (demonstrativo de pagamento individual)
// ---------------------------------------------------------------------------
export interface Rubrica {
  codigo: string | null
  descricao: string
  /** Como veio: "220:00", "30", "20,00" ou "" */
  referencia: string
  /** Referência em minutos quando é hora ("HH:MM"). */
  referencia_minutos: number | null
  valor: number
  tipo: 'vencimento' | 'desconto'
  categoria: string
  /** Número reconhecido com pouca certeza pelo OCR. */
  duvidoso?: boolean
}

export interface ContrachequeLido {
  origem_texto: OrigemTexto
  rubricas: Rubrica[]
  total_vencimentos: number | null
  total_descontos: number | null
  liquido: number | null
  bases: Record<string, number>
  /** Soma das rubricas lidas bate com os totais impressos (prova de leitura completa). */
  soma_confere: boolean | null
  confianca: 'alta' | 'media' | 'baixa'
  avisos: string[]
}

/** Texto vindo do OCR do servidor, no mesmo formato da leitura do PDF. */
export function pdfDeOcr(linhas: LinhaPdf[], texto: string[]): PdfLido {
  return {
    totalPaginas: 1,
    origem: 'ocr_servidor',
    paginas: [{ pagina: 1, linhas: texto }],
    posicionadas: [linhas],
    temImagens: true,
  }
}

const EH_VALOR = /^\*{0,5}[\d.]*\d,\d{2}\*{0,5}$/
const EH_REFERENCIA = /^\d{1,4}(?:[:,]\d{2})?$/

/** Categoria trabalhista da rubrica, pelo texto (tolerante a erro de OCR). */
export function categoriaRubrica(descricao: string): string {
  const d = descricao.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  const pct = d.match(/(\d{2,3})\s*%/)?.[1]
  if (/EXTRA|H\.?\s*E\.?\b/.test(d)) return pct ? `hora_extra_${pct}` : 'hora_extra'
  if (/NOTURN/.test(d)) return 'adicional_noturno'
  if (/REPOUSO|D\.?S\.?R/.test(d)) return 'dsr'
  if (/FALTA/.test(d)) return 'faltas'
  if (/ATRASO/.test(d)) return 'atrasos'
  if (/BANCO/.test(d)) return 'banco_de_horas'
  if (/HORAS?\s+NORMA|SALARIO\s*(BASE|MENSAL)?$|^SALARIO/.test(d)) return 'salario_horas_normais'
  if (/INSS/.test(d)) return 'inss'
  if (/IRRF|IMPOSTO/.test(d)) return 'irrf'
  if (/FERIAS/.test(d)) return 'ferias'
  if (/DECIMO|13/.test(d)) return 'decimo_terceiro'
  if (/VALE\s*TRANSP|V\.?T\.?/.test(d)) return 'vale_transporte'
  if (/GORJETA|TAXA DE SERV/.test(d)) return 'gorjeta'
  if (/INSALUBR/.test(d)) return 'insalubridade'
  if (/FAMILIA/.test(d)) return 'salario_familia'
  if (/ADIANTAMENTO/.test(d)) return 'adiantamento'
  if (/SINDICA|CONTRIB/.test(d)) return 'contribuicao_sindical'
  return 'outra'
}

function minutosDe(ref: string): number | null {
  const m = ref.match(/^(\d{1,4}):(\d{2})$/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

export function lerContracheque(pdf: PdfLido, duvidosos: string[] = []): ContrachequeLido {
  const duvida = new Set(duvidosos.map(s => s.trim()))
  const avisos: string[] = []
  const rubricas: Rubrica[] = []
  const bases: Record<string, number> = {}
  let liquido: number | null = null
  let totalV: number | null = null
  let totalD: number | null = null

  for (const linhas of pdf.posicionadas) {
    // Colunas pelo cabeçalho: x de "Vencimentos" e "Descontos".
    let xVenc = 0
    let xDesc = 0
    for (const l of linhas) {
      for (const i of l.itens) {
        if (/Vencimentos/i.test(i.s)) xVenc = i.x
        if (/Descontos/i.test(i.s)) xDesc = i.x
      }
      if (xVenc && xDesc) break
    }
    // Valor pertence à coluna cujo cabeçalho está mais perto no eixo x.
    const colunaDe = (x: number): Rubrica['tipo'] =>
      xVenc && xDesc && Math.abs(x - xDesc) < Math.abs(x - xVenc) ? 'desconto' : 'vencimento'

    for (let k = 0; k < linhas.length; k++) {
      const l = linhas[k]
      const texto = l.itens.map(i => i.s.trim()).join(' ').replace(/\s+/g, ' ').trim()
      const valores = l.itens.filter(i => EH_VALOR.test(i.s.trim()))

      if (/L[íi]quido/i.test(texto) && valores.length) { liquido = valorBr(valores[valores.length - 1].s); continue }

      // Linha de bases (cabeçalho com FGTS/INSS/IRRF e a linha seguinte com os números).
      if (/FGTS|Base\s*C[áa]l/i.test(texto) && !valores.length) {
        const prox = linhas[k + 1]
        const nums = prox?.itens.filter(i => EH_VALOR.test(i.s.trim())) ?? []
        if (nums.length) {
          for (const n of nums) {
            const rotulo = [...l.itens].sort((a, b) => Math.abs(a.x - n.x) - Math.abs(b.x - n.x))[0]?.s.trim()
            if (rotulo) bases[rotulo] = valorBr(n.s)
          }
          k++
        }
        continue
      }

      const primeiro = l.itens[0]
      const temCodigo = primeiro && /^\d{2,4}$/.test(primeiro.s.trim())
      const descricaoItens = l.itens.filter(i => /[A-Za-zÀ-ú]{3,}/.test(i.s))
      if (valores.length && descricaoItens.length && !/Total|Base|FGTS|INSS\s*Folha$/i.test(texto.slice(0, 12))) {
        const valorItem = valores[valores.length - 1]
        const refItem = l.itens.find(i => EH_REFERENCIA.test(i.s.trim()) && i !== primeiro && !EH_VALOR.test(i.s.trim()))
          ?? (valores.length >= 2 ? valores[0] : undefined)
        const descricao = descricaoItens.map(i => i.s.trim()).join(' ').replace(/\s+/g, ' ').trim()
        const referencia = refItem && refItem !== valorItem ? refItem.s.trim() : ''
        rubricas.push({
          codigo: temCodigo ? primeiro.s.trim() : null,
          descricao,
          referencia,
          referencia_minutos: minutosDe(referencia),
          valor: valorBr(valorItem.s),
          tipo: colunaDe(valorItem.x),
          categoria: categoriaRubrica(descricao),
          duvidoso: duvida.has(valorItem.s.trim()) || (refItem ? duvida.has(refItem.s.trim()) : false) || undefined,
        })
        continue
      }

      // Totais: linha só com 2 valores logo antes do líquido.
      if (valores.length === 2 && !descricaoItens.length && rubricas.length) {
        totalV = valorBr(valores[0].s)
        totalD = valorBr(valores[1].s)
      }
    }
    if (!xVenc || !xDesc) avisos.push('Cabeçalho de colunas não encontrado: vencimento × desconto deduzido pela posição.')
  }

  let confianca: ContrachequeLido['confianca'] = pdf.origem === 'nativo' ? 'alta' : 'media'
  if (rubricas.length === 0) {
    confianca = 'baixa'
    avisos.push('Nenhuma rubrica reconhecida: use o texto por linha ou a imagem da página.')
  }
  if (pdf.origem === 'ocr_do_scanner') {
    avisos.push('Texto vem do OCR do scanner (digitalização): números podem ter erro de reconhecimento.')
  }
  if (pdf.origem === 'ocr_servidor') {
    avisos.push('Texto lido por OCR no servidor (Tesseract) a partir da imagem digitalizada. Rubricas com "duvidoso" tiveram baixa certeza de reconhecimento.')
  }
  // Coerência: soma das rubricas × totais impressos (e líquido = vencimentos − descontos).
  let somaConfere: boolean | null = null
  if (totalV != null) {
    const somaV = rubricas.filter(r => r.tipo === 'vencimento').reduce((s, r) => s + r.valor, 0)
    const somaD = rubricas.filter(r => r.tipo === 'desconto').reduce((s, r) => s + r.valor, 0)
    somaConfere = Math.abs(somaV - totalV) <= 0.05 && (totalD == null || Math.abs(somaD - totalD) <= 0.05)
    if (!somaConfere) {
      avisos.push(`Soma lida (vencimentos ${somaV.toFixed(2)} / descontos ${somaD.toFixed(2)}) não bate com os totais impressos (${totalV.toFixed(2)} / ${totalD?.toFixed(2) ?? '—'}): leitura incompleta ou com erro.`)
      if (confianca === 'alta') confianca = 'media'
    } else if (confianca === 'media' && !rubricas.some(r => r.duvidoso)) {
      // OCR cuja soma fecha com os totais impressos e sem número duvidoso.
      confianca = 'alta'
      avisos.push('Soma das rubricas confere com os totais impressos.')
    }
  }
  return {
    origem_texto: pdf.origem,
    rubricas,
    total_vencimentos: totalV,
    total_descontos: totalD,
    liquido,
    bases,
    soma_confere: somaConfere,
    confianca,
    avisos,
  }
}

// ---------------------------------------------------------------------------
// Folha analítica do contador (todos da empresa no mês) → só o funcionário
// ---------------------------------------------------------------------------
function normalizaNome(s: string): string[] {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[^A-Z ]/g, ' ').split(/\s+/).filter(p => p.length > 2 && !['DOS', 'DAS', 'DE', 'DA', 'DO'].includes(p))
}

export function funcionarioNaFolhaAnalitica(pdf: PdfLido, nome: string) {
  const folha = lerFolhaContador(pdf.posicionadas.flat())
  const alvo = normalizaNome(nome)
  const achado = folha.funcionarios.find(f => {
    const n = normalizaNome(f.nome)
    const [menor, maior] = n.length <= alvo.length ? [n, alvo] : [alvo, n]
    return menor.length >= 2 && menor.every(p => maior.includes(p))
  })
  return {
    periodo: folha.periodoInicio && folha.periodoFim ? `${folha.periodoInicio} a ${folha.periodoFim}` : null,
    encontrado: !!achado,
    funcionario: achado
      ? {
          codigo: achado.codigo,
          nome_na_folha: achado.nome,
          salario_contratual: achado.salarioContratual,
          rubricas: achado.rubricas.map(r => ({
            ...r,
            referencia_minutos: minutosDe(r.referencia),
            categoria: categoriaRubrica(r.descricao),
          })),
          total_proventos: achado.totalProventos,
          total_descontos: achado.totalDescontos,
          liquido: achado.liquido,
        }
      : null,
  }
}
