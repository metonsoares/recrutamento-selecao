import 'server-only'
import type { LinhaPdf } from '@/lib/folha-contador'

/**
 * OCR no PRÓPRIO servidor do Recrutamento (Tesseract, português), para
 * digitalizações sem texto confiável. A imagem não sai daqui: só o modelo de
 * idioma é baixado (uma vez por instância, cache em /tmp).
 *
 * Devolve as palavras com POSIÇÃO e CONFIANÇA, para o leitor de contracheque
 * montar as linhas e marcar como duvidoso o número reconhecido com pouca
 * certeza — é isso que o ChatGPT não consegue fazer olhando a imagem.
 */

export interface OcrPagina {
  linhas: LinhaPdf[]
  texto: string[]
  confianca_media: number
  /** Números lidos com confiança < 80%. */
  duvidosos: string[]
}

const CONFIANCA_MINIMA = 80

export async function ocrImagem(jpeg: Uint8Array): Promise<OcrPagina> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('por', 1, { cachePath: '/tmp' })
  try {
    const { data } = await worker.recognize(Buffer.from(jpeg), {}, { blocks: true, text: true })
    const palavras: { x: number; y: number; h: number; s: string; c: number }[] = []
    for (const b of data.blocks ?? []) {
      for (const p of b.paragraphs ?? []) {
        for (const l of p.lines ?? []) {
          for (const w of l.words ?? []) {
            if (!w.text?.trim()) continue
            palavras.push({
              x: w.bbox.x0,
              y: (w.bbox.y0 + w.bbox.y1) / 2,
              h: Math.max(1, w.bbox.y1 - w.bbox.y0),
              s: w.text,
              c: w.confidence,
            })
          }
        }
      }
    }
    // Agrupa por linha (centro vertical, tolerância de meia altura de letra).
    palavras.sort((a, b) => a.y - b.y)
    const grupos: { y: number; h: number; itens: typeof palavras }[] = []
    for (const w of palavras) {
      const g = grupos.find(x => Math.abs(x.y - w.y) <= Math.max(x.h, w.h) * 0.5)
      if (g) g.itens.push(w)
      else grupos.push({ y: w.y, h: w.h, itens: [w] })
    }
    const linhas: LinhaPdf[] = grupos.map(g => ({ itens: g.itens.sort((a, b) => a.x - b.x).map(w => ({ x: Math.round(w.x), s: w.s })) }))
    const duvidosos = palavras.filter(w => /\d/.test(w.s) && w.c < CONFIANCA_MINIMA).map(w => w.s)
    const media = palavras.length ? palavras.reduce((s, w) => s + w.c, 0) / palavras.length : 0
    return {
      linhas,
      texto: linhas.map(l => l.itens.map(i => i.s).join('  ')),
      confianca_media: Math.round(media),
      duvidosos,
    }
  } finally {
    await worker.terminate().catch(() => undefined)
  }
}
