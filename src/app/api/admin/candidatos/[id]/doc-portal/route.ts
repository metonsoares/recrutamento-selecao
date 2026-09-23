import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requirePermissionApi } from '@/lib/auth-guard'
import { generateToken } from '@/lib/helpers'

/**
 * Link externo de envio de documentos do colaborador.
 *
 * POST devolve o link ativo (cria na primeira vez). É um link por PESSOA, não
 * por documento: a página pública lê a ficha na hora, então o mesmo endereço
 * continua valendo enquanto houver pendência e avisa quando não houver mais.
 *
 * DELETE revoga o link atual — usar quando o endereço vazar para quem não
 * deveria tê-lo. O próximo POST gera outro.
 */
function urlBase(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL
    || process.env.APP_URL
    || req.nextUrl.origin
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requirePermissionApi('ficha.admissao')
    if (denied) return denied

    const { id } = await params
    const supabase = await createSupabaseServiceClient()

    const { data: candidate } = await supabase
      .from('candidates').select('id, full_name').eq('id', id).maybeSingle()
    if (!candidate) return NextResponse.json({ error: 'Colaborador não encontrado.' }, { status: 404 })

    const { data: app } = await supabase
      .from('applications').select('id').eq('candidate_id', id).eq('is_latest', true).maybeSingle()

    const { data: existente } = await supabase
      .from('doc_portals').select('token')
      .eq('candidate_id', id).is('revoked_at', null).maybeSingle()

    let token = existente?.token as string | undefined
    if (!token) {
      token = generateToken()
      const { error } = await supabase.from('doc_portals').insert({
        candidate_id: id,
        application_id: app?.id ?? null,
        token,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, url: `${urlBase(req)}/documentos/${token}` })
  } catch (err) {
    console.error('[doc-portal POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requirePermissionApi('ficha.admissao')
    if (denied) return denied

    const { id } = await params
    const supabase = await createSupabaseServiceClient()
    const agora = new Date().toISOString()
    const { error } = await supabase.from('doc_portals')
      .update({ revoked_at: agora, updated_at: agora })
      .eq('candidate_id', id).is('revoked_at', null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[doc-portal DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
