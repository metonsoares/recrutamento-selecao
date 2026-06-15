import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

/**
 * GET — status D4Sign (do banco, sem chamar a API da D4Sign) dos contratos do
 * candidato. Usado pelo polling da tela para refletir o que o webhook atualizou.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await createSupabaseServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

    const { id } = await params
    const supabase = await createSupabaseServiceClient()
    const { data } = await supabase
      .from('freelancer_contracts')
      .select('id, d4sign_status, d4sign_status_raw, signed_file_url')
      .eq('candidate_id', id)

    return NextResponse.json({ contracts: data || [] })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
