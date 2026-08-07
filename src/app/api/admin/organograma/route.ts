import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requirePermissionApi } from '@/lib/auth-guard'

// CRUD dos nós do organograma (pessoas) e das áreas/setores.
// Leitura da árvore é feita direto na página (server component).

/** POST — adiciona um colaborador ao organograma (ou cria uma área). */
export async function POST(req: NextRequest) {
  try {
    const denied = await requirePermissionApi('organograma.editar')
    if (denied) return denied

    const b = await req.json().catch(() => ({}))
    const supabase = await createSupabaseServiceClient()

    // Criação de área/setor
    if (b.tipo === 'area') {
      const nome = String(b.nome ?? '').trim()
      const parentId = String(b.parent_id ?? '')
      if (!nome) return NextResponse.json({ error: 'Informe o nome da área.' }, { status: 400 })
      if (!parentId) return NextResponse.json({ error: 'Informe a unidade da área.' }, { status: 400 })
      const { data, error } = await supabase
        .from('org_unidades')
        .insert({
          parent_id: parentId, tipo: 'area', nome,
          divisao: b.divisao ?? 'Backoffice',
          escopo: b.escopo === 'grupo' ? 'grupo' : 'local',
        })
        .select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ ok: true, unidade: data })
    }

    // Adição de pessoa
    const unidadeId = String(b.unidade_id ?? '')
    if (!unidadeId) return NextResponse.json({ error: 'Escolha onde o colaborador se encaixa.' }, { status: 400 })

    const candidateId = b.candidate_id ? String(b.candidate_id) : null
    let nome = String(b.nome ?? '').trim()
    let cargo = String(b.cargo ?? '').trim()

    // Vindo de um colaborador já cadastrado: puxa nome/cargo da ficha.
    if (candidateId) {
      const { data: dup } = await supabase
        .from('org_nos').select('id').eq('candidate_id', candidateId).maybeSingle()
      if (dup) return NextResponse.json({ error: 'Esse colaborador já está no organograma.' }, { status: 400 })

      const { data: cand } = await supabase
        .from('candidates').select('full_name').eq('id', candidateId).maybeSingle()
      if (!cand) return NextResponse.json({ error: 'Colaborador não encontrado.' }, { status: 404 })
      if (!nome) nome = cand.full_name as string
      if (!cargo) {
        const { data: app } = await supabase
          .from('applications').select('admission_form')
          .eq('candidate_id', candidateId).eq('is_latest', true).maybeSingle()
        const af = app?.admission_form as Record<string, unknown> | null
        cargo = String(af?.function_title ?? '').trim()
      }
    }

    if (!nome) return NextResponse.json({ error: 'Informe o nome do colaborador.' }, { status: 400 })

    const { data, error } = await supabase
      .from('org_nos')
      .insert({
        unidade_id: unidadeId,
        candidate_id: candidateId,
        reporta_a: b.reporta_a ? String(b.reporta_a) : null,
        nome, cargo: cargo || null,
        nivel: b.nivel ? String(b.nivel) : null,
      })
      .select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, no: data })
  } catch (err) {
    console.error('[organograma POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/** PATCH — move/edita um nó (unidade, chefia, cargo, nome). */
export async function PATCH(req: NextRequest) {
  try {
    const denied = await requirePermissionApi('organograma.editar')
    if (denied) return denied

    const b = await req.json().catch(() => ({}))
    const id = String(b.id ?? '')
    if (!id) return NextResponse.json({ error: 'Nó não informado.' }, { status: 400 })

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof b.nome === 'string' && b.nome.trim()) update.nome = b.nome.trim()
    if (typeof b.cargo === 'string') update.cargo = b.cargo.trim() || null
    if (typeof b.unidade_id === 'string' && b.unidade_id) update.unidade_id = b.unidade_id
    if ('reporta_a' in b) update.reporta_a = b.reporta_a || null
    if ('nivel' in b) update.nivel = b.nivel || null

    // Não deixa um nó reportar a si mesmo (ciclo trivial).
    if (update.reporta_a === id) {
      return NextResponse.json({ error: 'Um colaborador não pode reportar a si mesmo.' }, { status: 400 })
    }

    const supabase = await createSupabaseServiceClient()

    // Impede ciclo: o novo chefe não pode estar abaixo deste nó.
    if (update.reporta_a) {
      const { data: todos } = await supabase.from('org_nos').select('id, reporta_a')
      const byId = new Map((todos ?? []).map(n => [n.id as string, n.reporta_a as string | null]))
      let cursor = update.reporta_a as string | null
      const visitados = new Set<string>()
      while (cursor) {
        if (cursor === id) {
          return NextResponse.json({ error: 'Essa chefia criaria um ciclo na hierarquia.' }, { status: 400 })
        }
        if (visitados.has(cursor)) break
        visitados.add(cursor)
        cursor = byId.get(cursor) ?? null
      }
    }

    const { error } = await supabase.from('org_nos').update(update).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[organograma PATCH]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/** DELETE — remove um nó do organograma (quem reportava a ele fica sem chefia). */
export async function DELETE(req: NextRequest) {
  try {
    const denied = await requirePermissionApi('organograma.editar')
    if (denied) return denied

    const b = await req.json().catch(() => ({}))
    const id = String(b.id ?? '')
    const unidadeId = String(b.unidade_id ?? '')
    const supabase = await createSupabaseServiceClient()

    if (unidadeId) {
      // Remoção de área: só quando estiver vazia.
      const { count } = await supabase
        .from('org_nos').select('id', { count: 'exact', head: true }).eq('unidade_id', unidadeId)
      if ((count ?? 0) > 0) {
        return NextResponse.json({ error: 'Mova os colaboradores antes de remover esta área.' }, { status: 400 })
      }
      const { error } = await supabase
        .from('org_unidades').delete().eq('id', unidadeId).eq('tipo', 'area')
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    if (!id) return NextResponse.json({ error: 'Nó não informado.' }, { status: 400 })
    const { error } = await supabase.from('org_nos').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[organograma DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
