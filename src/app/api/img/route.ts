import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Proxy de imagens do Storage público do Supabase, servidas pelo próprio
// domínio do app (evita falhas de carregamento cross-origin no navegador).
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u')
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '') + '/storage/v1/object/public/'
  if (!u || !base || !u.startsWith(base)) {
    return new NextResponse('URL não permitida.', { status: 403 })
  }
  try {
    const r = await fetch(u, { cache: 'no-store' })
    if (!r.ok) return new NextResponse('Arquivo não encontrado.', { status: r.status })
    const buf = await r.arrayBuffer()
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': r.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    })
  } catch {
    return new NextResponse('Falha ao obter o arquivo.', { status: 502 })
  }
}
