import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { getD4SignCreds, getSignedFileUrl } from '@/lib/d4sign'

export const maxDuration = 45

/** GET — baixa o PDF assinado do contrato (busca a URL atual na D4Sign e faz stream como anexo). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; contractId: string }> }) {
  try {
    const auth = await createSupabaseServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

    const { id, contractId } = await params
    const creds = await getD4SignCreds()
    if (!creds) return NextResponse.json({ error: 'D4Sign não conectada.' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()
    const { data: contract } = await supabase
      .from('freelancer_contracts').select('d4sign_uuid, title').eq('id', contractId).eq('candidate_id', id).maybeSingle()
    if (!contract?.d4sign_uuid) return NextResponse.json({ error: 'Contrato não enviado para assinatura.' }, { status: 400 })

    const { data: cand } = await supabase.from('candidates').select('full_name').eq('id', id).maybeSingle()

    // URL fresca do PDF assinado na D4Sign
    const url = await getSignedFileUrl(creds, contract.d4sign_uuid as string)
    if (!url) return NextResponse.json({ error: 'Documento ainda não está disponível para download.' }, { status: 409 })

    const fileRes = await fetch(url)
    if (!fileRes.ok) return NextResponse.json({ error: 'Não foi possível baixar o documento assinado.' }, { status: 502 })
    const buf = await fileRes.arrayBuffer()

    const candidateName = (cand?.full_name as string | null)?.trim() || 'Funcionário'
    const title = (contract.title as string | null)?.trim() || 'Contrato'
    const safe = `${candidateName} - ${title} (assinado)`.replace(/[^\w.\-() À-ÿ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': fileRes.headers.get('content-type') || 'application/pdf',
        'Content-Disposition': `attachment; filename="${safe}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[contrato d4sign download]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
