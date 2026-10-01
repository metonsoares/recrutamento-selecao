import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requirePermissionApi } from '@/lib/auth-guard'

export const dynamic = 'force-dynamic'

/**
 * Cadastro de cargos (Configurações → Empresa).
 *
 * A ficha do colaborador grava o cargo como TEXTO (admission_form.function_title),
 * e é daí que veio a lista. Por isso renomear um cargo aqui também renomeia nas
 * fichas que usam exatamente aquele nome: sem isso o cadastro diria uma coisa e
 * as fichas outra, que é justamente a bagunça de grafia que existia.
 */

function nomeLimpo(v: unknown): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
}

/** Quantas fichas ativas usam cada cargo (comparando sem diferenciar maiúscula). */
async function pessoasPorCargo(service: Awaited<ReturnType<typeof createSupabaseServiceClient>>) {
  const { data } = await service
    .from('applications')
    .select('cargo:admission_form->>function_title')
    .eq('is_latest', true)

  const mapa = new Map<string, number>()
  for (const linha of data ?? []) {
    const nome = nomeLimpo((linha as { cargo?: string | null }).cargo).toLowerCase()
    if (!nome) continue
    mapa.set(nome, (mapa.get(nome) ?? 0) + 1)
  }
  return mapa
}

/** POST — cria um cargo. */
export async function POST(req: NextRequest) {
  try {
    const denied = await requirePermissionApi('config.empresa_cadastro')
    if (denied) return denied

    const nome = nomeLimpo((await req.json().catch(() => ({}))).nome)
    if (nome.length < 2) return NextResponse.json({ error: 'Informe o nome do cargo.' }, { status: 400 })

    const service = await createSupabaseServiceClient()
    const { error } = await service.from('cargos').insert({ nome })
    if (error) {
      const repetido = error.code === '23505'
      return NextResponse.json(
        { error: repetido ? 'Já existe um cargo com esse nome.' : error.message },
        { status: repetido ? 409 : 500 },
      )
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[cargos POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/** PUT — renomeia o cargo aqui e nas fichas que usam o nome antigo. */
export async function PUT(req: NextRequest) {
  try {
    const denied = await requirePermissionApi('config.empresa_cadastro')
    if (denied) return denied

    const body = await req.json().catch(() => ({}))
    const id = String(body.id ?? '')
    const nome = nomeLimpo(body.nome)
    if (!id || nome.length < 2) return NextResponse.json({ error: 'Dados incompletos.' }, { status: 400 })

    const service = await createSupabaseServiceClient()
    const { data: atual } = await service.from('cargos').select('nome').eq('id', id).maybeSingle()
    if (!atual) return NextResponse.json({ error: 'Cargo não encontrado.' }, { status: 404 })
    const antigo = String(atual.nome)

    const { error } = await service.from('cargos')
      .update({ nome, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) {
      const repetido = error.code === '23505'
      return NextResponse.json(
        { error: repetido ? 'Já existe um cargo com esse nome.' : error.message },
        { status: repetido ? 409 : 500 },
      )
    }

    // Fichas que usam o nome antigo acompanham a correção.
    let fichas = 0
    if (antigo.toLowerCase() !== nome.toLowerCase()) {
      const { data: apps } = await service
        .from('applications').select('id, admission_form').eq('is_latest', true)
      for (const a of apps ?? []) {
        const ficha = (a.admission_form ?? null) as Record<string, unknown> | null
        const atualNome = nomeLimpo(ficha?.function_title)
        if (!ficha || atualNome.toLowerCase() !== antigo.toLowerCase()) continue
        await service.from('applications')
          .update({ admission_form: { ...ficha, function_title: nome }, updated_at: new Date().toISOString() })
          .eq('id', a.id as string)
        fichas++
      }
    }

    return NextResponse.json({ ok: true, fichas })
  } catch (err) {
    console.error('[cargos PUT]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/**
 * DELETE — tira o cargo da lista.
 *
 * As fichas não são tocadas: apagar o cargo não pode apagar o que está escrito
 * no registro de quem já foi admitido. Por isso a tela avisa quantas pessoas
 * usam o cargo antes de remover.
 */
export async function DELETE(req: NextRequest) {
  try {
    const denied = await requirePermissionApi('config.empresa_cadastro')
    if (denied) return denied

    const id = String((await req.json().catch(() => ({}))).id ?? '')
    if (!id) return NextResponse.json({ error: 'Cargo não informado.' }, { status: 400 })

    const service = await createSupabaseServiceClient()
    const { data: cargo } = await service.from('cargos').select('nome').eq('id', id).maybeSingle()
    if (!cargo) return NextResponse.json({ error: 'Cargo não encontrado.' }, { status: 404 })

    const emUso = (await pessoasPorCargo(service)).get(String(cargo.nome).toLowerCase()) ?? 0

    const { error } = await service.from('cargos').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, emUso })
  } catch (err) {
    console.error('[cargos DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
