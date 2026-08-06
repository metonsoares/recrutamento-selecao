import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

// Transferir de empresa: arquiva um snapshot da ficha de admissão ATUAL em
// admission_form_history (com carimbo arquivada_em) e mantém admission_form
// como a ficha ativa/editável — o usuário então troca a empresa contratante
// e demais campos na ficha ativa. O status do funcionário não é alterado
// (permanece "Contratado").
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createSupabaseServiceClient()

    const { data: app, error: appError } = await supabase
      .from('applications')
      .select('id, admission_form, admission_form_history')
      .eq('candidate_id', id)
      .eq('is_latest', true)
      .maybeSingle()
    if (appError) return NextResponse.json({ error: appError.message }, { status: 500 })
    if (!app) return NextResponse.json({ error: 'Candidatura não encontrada.' }, { status: 404 })
    if (!app.admission_form) {
      return NextResponse.json(
        { error: 'Não há ficha preenchida para arquivar. Salve a ficha antes de transferir.' },
        { status: 400 },
      )
    }

    const history = Array.isArray(app.admission_form_history) ? app.admission_form_history : []
    const archived = {
      ...(app.admission_form as Record<string, unknown>),
      arquivada_em: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('applications')
      .update({
        admission_form_history: [...history, archived],
        updated_at: new Date().toISOString(),
      })
      .eq('id', app.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, archived_count: history.length + 1 })
  } catch (err) {
    console.error('[transfer-company POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

// Excluir uma ficha anterior específica do histórico (admission_form_history),
// identificada pelo carimbo arquivada_em (único, gerado no servidor a cada
// transferência). Remoção definitiva do snapshot; a ficha ativa não é tocada.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { arquivada_em } = await req.json().catch(() => ({} as { arquivada_em?: string }))
    if (!arquivada_em) {
      return NextResponse.json({ error: 'Identificador da ficha anterior ausente.' }, { status: 400 })
    }
    const supabase = await createSupabaseServiceClient()

    const { data: app, error: appError } = await supabase
      .from('applications')
      .select('id, admission_form_history')
      .eq('candidate_id', id)
      .eq('is_latest', true)
      .maybeSingle()
    if (appError) return NextResponse.json({ error: appError.message }, { status: 500 })
    if (!app) return NextResponse.json({ error: 'Candidatura não encontrada.' }, { status: 404 })

    const history = Array.isArray(app.admission_form_history) ? app.admission_form_history : []
    const next = history.filter(
      (h) => (h as { arquivada_em?: string } | null)?.arquivada_em !== arquivada_em,
    )
    if (next.length === history.length) {
      return NextResponse.json({ error: 'Ficha anterior não encontrada.' }, { status: 404 })
    }

    const { error } = await supabase
      .from('applications')
      .update({ admission_form_history: next, updated_at: new Date().toISOString() })
      .eq('id', app.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, removed: history.length - next.length })
  } catch (err) {
    console.error('[transfer-company DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
