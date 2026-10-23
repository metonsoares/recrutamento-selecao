import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requirePermissionApi } from '@/lib/auth-guard'
import { BUCKET_ANEXOS, PASTA_ANEXOS } from '@/lib/notas-anexos'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/candidatos/[id]/notes/anexo?path=…
 *
 * Abre um anexo da observação interna. O bucket é privado, então aqui se
 * confere a permissão e se assina uma URL que vale 60 segundos — tempo de o
 * navegador buscar o arquivo e nada além disso. Um link copiado da barra de
 * endereço não serve para ninguém depois disso.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requirePermissionApi('candidatos.ver')
    if (denied) return denied

    const { id } = await ctx.params
    const path = req.nextUrl.searchParams.get('path') || ''

    // O path vem da query: só vale dentro da pasta deste candidato.
    if (!path.startsWith(`${PASTA_ANEXOS}/${id}/`)) {
      return NextResponse.json({ error: 'Anexo não pertence a este candidato.' }, { status: 403 })
    }

    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase.storage
      .from(BUCKET_ANEXOS)
      .createSignedUrl(path, 60)

    if (error || !data?.signedUrl) {
      console.error('[notes anexo]', error)
      return NextResponse.json({ error: 'Anexo não encontrado.' }, { status: 404 })
    }

    return NextResponse.redirect(data.signedUrl)
  } catch (err) {
    console.error('[notes anexo GET]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
