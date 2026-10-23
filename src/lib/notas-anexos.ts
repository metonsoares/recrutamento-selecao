/**
 * Anexos das Observações Internas da ficha (pedido do dono em 23/10/2026).
 *
 * Um lugar só para as regras, porque elas aparecem em três pontos: a tela que
 * escolhe o arquivo, a rota que sobe e a rota que assina o download.
 */

/** Bucket PRIVADO já usado pelos documentos do candidato. */
export const BUCKET_ANEXOS = 'admission-docs'

/** Pasta dentro do bucket — separa o que é anexo de observação do resto. */
export const PASTA_ANEXOS = 'observacoes'

/** 5 MB por arquivo. Vale por arquivo, não pelo total da observação. */
export const MAX_ANEXO_BYTES = 5 * 1024 * 1024

/**
 * Tipos aceitos. É a MESMA lista do bucket no Supabase: subir algo fora dela
 * seria recusado pelo Storage com um erro genérico, então barramos antes para
 * poder dizer o que fazer.
 */
export const TIPOS_ANEXO = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]

/** O que o seletor de arquivos oferece (celular inclusive). */
export const ACCEPT_ANEXOS =
  'application/pdf,.pdf,image/*,.doc,.docx,.xls,.xlsx'

export interface AnexoNota {
  name: string
  path: string
  size: number
  type: string
}

const EXT_POR_TIPO: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
}

/** Extensão do objeto no Storage — do nome quando dá, do tipo quando não dá. */
export function extensaoDe(nome: string, tipo: string): string {
  const doNome = nome.includes('.') ? nome.split('.').pop()!.toLowerCase() : ''
  if (/^[a-z0-9]{1,5}$/.test(doNome)) return doNome
  return EXT_POR_TIPO[tipo] ?? 'bin'
}

/** Tamanho legível para a tela ("1,4 MB"). */
export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

/**
 * Valida o que veio do navegador antes de gravar no banco. O path é conferido
 * contra a pasta do próprio candidato — o resto do objeto é só exibição.
 */
export function sanitizarAnexos(bruto: unknown, candidateId: string): AnexoNota[] | null {
  if (bruto == null) return []
  if (!Array.isArray(bruto)) return null
  if (bruto.length > 10) return null

  const prefixo = `${PASTA_ANEXOS}/${candidateId}/`
  const limpos: AnexoNota[] = []

  for (const item of bruto) {
    if (!item || typeof item !== 'object') return null
    const { name, path, size, type } = item as Record<string, unknown>
    if (typeof path !== 'string' || !path.startsWith(prefixo)) return null
    if (typeof name !== 'string' || !name.trim()) return null
    if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0 || size > MAX_ANEXO_BYTES) return null
    if (typeof type !== 'string' || !TIPOS_ANEXO.includes(type)) return null
    limpos.push({ name: name.slice(0, 200), path, size, type })
  }
  return limpos
}
