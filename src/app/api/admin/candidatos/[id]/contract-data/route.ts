import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

/**
 * PUT /api/admin/candidatos/[id]/contract-data
 * body: { data: {...contrato}, status?: 'contratado'|'desligado' }
 * Salva contract_data e, opcionalmente, muda o status da candidatura.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: candidateId } = await params
    const { data: contractData, status } = await req.json()

    const supabase = await createSupabaseServiceClient()
    const { data: app } = await supabase
      .from('applications')
      .select('id')
      .eq('candidate_id', candidateId)
      .eq('is_latest', true)
      .maybeSingle()

    if (!app) return NextResponse.json({ error: 'Candidatura não encontrada.' }, { status: 404 })

    const update: Record<string, unknown> = {
      contract_data: contractData,
      updated_at: new Date().toISOString(),
    }
    if (status) update.status = status

    const { error } = await supabase.from('applications').update(update).eq('id', app.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[contract-data PUT]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
