import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requireAnyRoleApi } from '@/lib/auth-guard'
import { caminhoNoBucket } from '@/lib/arquivo-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Serve arquivo do Storage pelo próprio domínio do app.
 *
 * Antes esta rota apenas repassava a URL PÚBLICA do Storage, sem pedir login —
 * ou seja, mantinha aberto o que o bucket público já abria. Agora ela:
 *  1. exige perfil do RH (a rota não está sob /api/admin, então o gate do
 *     proxy.ts não a cobre — a checagem é feita aqui, explicitamente);
 *  2. lê o arquivo com a service role, por URL assinada de vida curta.
 *
 * Com isso `<img src>` continua funcionando com o bucket FECHADO, e nada
 * precisa ser migrado: o caminho dentro do bucket sai da própria URL guardada
 * no registro (ver `src/lib/arquivo-url.ts`).
 *
 * Aceita `u` (URL pública guardada, do formato antigo) ou `bucket` + `path`.
 */

const BUCKETS = ['candidatos-arquivos', 'admission-docs', 'folhas-analiticas', 'company-assets']
const VALIDADE_SEGUNDOS = 120

/** Descobre bucket + caminho a partir da URL guardada no registro. */
function doUrlPublica(u: string): { bucket: string; path: string } | null {
  for (const bucket of BUCKETS) {
    const path = caminhoNoBucket(u, bucket)
    if (path) return { bucket, path }
  }
  return null
}

export async function GET(req: NextRequest) {
  const denied = await requireAnyRoleApi(['master', 'admin', 'gestor_rh', 'gestor'])
  if (denied) return denied

  const u = req.nextUrl.searchParams.get('u')
  const bucketParam = req.nextUrl.searchParams.get('bucket')
  const pathParam = req.nextUrl.searchParams.get('path')
  const dl = req.nextUrl.searchParams.get('dl') === '1' // força download
  const name = req.nextUrl.searchParams.get('name') || 'arquivo'

  const alvo = u ? doUrlPublica(u) : null
  const bucket = alvo?.bucket ?? bucketParam ?? ''
  const path = alvo?.path ?? pathParam ?? ''

  if (!BUCKETS.includes(bucket)) {
    return new NextResponse('Bucket não permitido.', { status: 403 })
  }
  // Sem isto, um path com ".." ou absoluto poderia escapar da pasta.
  if (!path || path.includes('..') || path.startsWith('/')) {
    return new NextResponse('Caminho inválido.', { status: 400 })
  }

  try {
    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, VALIDADE_SEGUNDOS)
    if (error || !data?.signedUrl) {
      return new NextResponse('Arquivo não encontrado.', { status: 404 })
    }

    const r = await fetch(data.signedUrl, { cache: 'no-store' })
    if (!r.ok) return new NextResponse('Arquivo não encontrado.', { status: r.status })
    const buf = await r.arrayBuffer()

    const headers: Record<string, string> = {
      'Content-Type': r.headers.get('content-type') || 'application/octet-stream',
      // `private`: é documento de pessoa — pode ficar no navegador de quem tem
      // acesso, nunca num cache compartilhado.
      'Cache-Control': 'private, max-age=3600',
    }
    if (dl) {
      const safe = name.replace(/[^\w.\-() ]+/g, '_').slice(0, 120)
      headers['Content-Disposition'] = `attachment; filename="${safe}"`
    }
    return new NextResponse(buf, { status: 200, headers })
  } catch {
    return new NextResponse('Falha ao obter o arquivo.', { status: 502 })
  }
}
