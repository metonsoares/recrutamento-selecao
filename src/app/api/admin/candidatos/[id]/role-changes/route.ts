import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient, createSupabaseServerClient } from '@/lib/supabase-server'
import { requirePermissionApi } from '@/lib/auth-guard'

/**
 * Mudanças de função do colaborador.
 *
 * A ficha guarda a função ATUAL (`admission_form.function_title`); esta tabela
 * guarda a linha do tempo. Ao registrar uma troca, gravamos a função anterior
 * junto — assim o histórico continua legível mesmo depois de várias mudanças.
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requirePermissionApi('ficha.admissao')
    if (denied) return denied

    const { id } = await params
    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('role_changes')
      .select('*')
      .eq('candidate_id', id)
      .order('change_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ changes: data })
  } catch (err) {
    console.error('[role-changes GET]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requirePermissionApi('ficha.admissao')
    if (denied) return denied

    const { id } = await params
    const body = await req.json().catch(() => ({}))

    const changeDate = String(body.change_date ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(changeDate)) {
      return NextResponse.json({ error: 'Informe a data da mudança.' }, { status: 400 })
    }
    const newTitle = String(body.new_title ?? '').trim()
    if (!newTitle) {
      return NextResponse.json({ error: 'Informe a nova função.' }, { status: 400 })
    }

    const supabase = await createSupabaseServiceClient()
    const auth = await createSupabaseServerClient()
    const { data: { user } } = await auth.auth.getUser()

    // A função anterior sai da própria ficha ativa: é a verdade no momento da
    // troca, e guardá-la aqui evita depender de reconstruir o passado depois.
    const { data: app } = await supabase
      .from('applications')
      .select('id, admission_form')
      .eq('candidate_id', id)
      .eq('is_latest', true)
      .maybeSingle()

    const ficha = (app?.admission_form ?? null) as Record<string, unknown> | null
    const anterior = String(ficha?.function_title ?? '').trim() || null

    if (anterior && anterior.toLowerCase() === newTitle.toLowerCase()) {
      return NextResponse.json(
        { error: 'A nova função é igual à atual.' },
        { status: 400 },
      )
    }

    const { data, error } = await supabase
      .from('role_changes')
      .insert({
        candidate_id: id,
        change_date: changeDate,
        previous_title: anterior,
        new_title: newTitle,
        comment: String(body.comment ?? '').trim() || null,
        created_by: user?.email ?? null,
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // A ficha passa a mostrar a função nova. O histórico fica na tabela — por
    // isso a troca não perde o que veio antes.
    if (app?.id) {
      const { error: erroFicha } = await supabase
        .from('applications')
        .update({ admission_form: { ...(ficha ?? {}), function_title: newTitle } })
        .eq('id', app.id)
      if (erroFicha) {
        return NextResponse.json(
          { error: `Mudança registrada, mas a ficha não foi atualizada: ${erroFicha.message}` },
          { status: 500 },
        )
      }
    }

    return NextResponse.json({ change: data, ficha_atualizada: !!app?.id })
  } catch (err) {
    console.error('[role-changes POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
