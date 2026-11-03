import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requirePermissionApi } from '@/lib/auth-guard'
import { conferirData } from '@/lib/helpers'

/** GET — lista advertências do candidato */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requirePermissionApi('ficha.advertencias')
    if (denied) return denied
    const { id } = await params
    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('warnings')
      .select('*')
      .eq('candidate_id', id)
      .order('occurred_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ warnings: data })
  } catch (err) {
    console.error('[warnings GET]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/** POST — cria advertência */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requirePermissionApi('ficha.advertencias')
    if (denied) return denied
    const { id } = await params
    const { occurred_at, reason, file_url, file_name, file_path } = await req.json()
    if (!occurred_at || !reason?.trim()) {
      return NextResponse.json({ error: 'Data e motivo são obrigatórios.' }, { status: 400 })
    }
    // Ano digitado errado não dá erro em lugar nenhum — só faz a advertência
    // sumir dos filtros por mês (Prêmio Caju, relatórios).
    const problema = conferirData(occurred_at, 'A data do ocorrido')
    if (problema) return NextResponse.json({ error: problema }, { status: 400 })
    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('warnings')
      .insert({
        candidate_id: id,
        occurred_at,
        reason: reason.trim(),
        file_url: file_url || null,
        file_name: file_name || null,
        file_path: file_path || null,
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ warning: data })
  } catch (err) {
    console.error('[warnings POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
