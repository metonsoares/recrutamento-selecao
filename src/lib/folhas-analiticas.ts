/**
 * Folha analítica (documentos da empresa) — regras compartilhadas.
 *
 * O arquivo NÃO passa pela função da Vercel: ela corta o corpo em ~4,5 MB
 * (FUNCTION_PAYLOAD_TOO_LARGE, medido no ar em 23/10/2026), e folha analítica
 * digitalizada passa disso fácil. O navegador manda direto para o Storage com
 * uma autorização assinada; o servidor só autoriza e depois registra.
 */

export const BUCKET_FOLHAS = 'folhas-analiticas'

/** Limite por arquivo prometido na tela. */
export const MAX_FOLHA_BYTES = 25 * 1024 * 1024

/**
 * É PDF?
 *
 * O `type` do navegador não é confiável: PDF que vem de scanner, do Drive ou
 * de pasta de rede chega com `application/octet-stream` ou vazio. Nesses casos
 * vale a extensão — recusar um PDF de verdade por causa do rótulo do sistema
 * operacional era o que mais confundia quem envia.
 */
export function ehPdf(name: string, type: string): boolean {
  if (type === 'application/pdf' || type === 'application/x-pdf') return true
  const semRotulo = !type || type === 'application/octet-stream' || type === 'binary/octet-stream'
  return semRotulo && /\.pdf$/i.test(name.trim())
}

/** Nome do objeto no bucket — o navegador não escolhe onde grava. */
export function objetoDaFolha(competencia: string, name: string): string {
  const limpo = name.replace(/[^\w.-]+/g, '_').slice(-80)
  return `${competencia.slice(0, 7)}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${limpo}`
}

export function tamanhoDaFolha(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}
