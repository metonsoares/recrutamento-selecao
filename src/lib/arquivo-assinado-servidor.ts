import 'server-only'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { caminhoNoBucket } from '@/lib/arquivo-url'

/**
 * Assina, no servidor, as URLs de foto que as listas entregam ao `next/image`.
 *
 * Por que assinar no render aqui (e não no clique, como nos anexos): a foto é
 * `<img>`, o navegador busca sozinho assim que a tela aparece. E o otimizador
 * de imagem da Vercel busca a imagem SEM os cookies do usuário, então uma rota
 * protegida do app não serve para o `next/image` — o que funciona é a URL
 * assinada do próprio Storage, que o `remotePatterns` já libera.
 *
 * Validade de 1 hora: a imagem carrega no instante em que a lista abre; a folga
 * cobre a aba que fica aberta e recarrega.
 */

const BUCKETS = ['candidatos-arquivos', 'admission-docs', 'folhas-analiticas']
const VALIDADE_SEGUNDOS = 60 * 60

/**
 * Recebe as URLs públicas guardadas nos registros e devolve o mapa
 * `url original -> url assinada`. URL que não seja de um bucket nosso fica de
 * fora (quem chama mantém o valor original).
 */
export async function assinarUrlsDeArquivos(
  urls: (string | null | undefined)[],
): Promise<Record<string, string>> {
  const porBucket = new Map<string, Map<string, string>>() // bucket -> path -> url original
  for (const url of urls) {
    if (!url) continue
    for (const bucket of BUCKETS) {
      const path = caminhoNoBucket(url, bucket)
      if (!path) continue
      if (!porBucket.has(bucket)) porBucket.set(bucket, new Map())
      porBucket.get(bucket)!.set(path, url)
      break
    }
  }
  if (porBucket.size === 0) return {}

  const mapa: Record<string, string> = {}
  const supabase = await createSupabaseServiceClient()
  for (const [bucket, paths] of porBucket) {
    const lista = [...paths.keys()]
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrls(lista, VALIDADE_SEGUNDOS)
    if (error || !data) continue
    for (const item of data) {
      // `item.path` volta como foi pedido; arquivo removido vem com erro.
      if (!item.signedUrl || !item.path) continue
      const original = paths.get(item.path)
      if (original) mapa[original] = item.signedUrl
    }
  }
  return mapa
}

/** Versão para uma URL só (telas de detalhe e impressão). */
export async function assinarUrlDeArquivo(
  url: string | null | undefined,
): Promise<string | null> {
  if (!url) return null
  const mapa = await assinarUrlsDeArquivos([url])
  return mapa[url] ?? url
}
