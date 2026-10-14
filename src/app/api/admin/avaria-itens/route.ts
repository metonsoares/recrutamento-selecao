import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requireAnyRoleApi } from '@/lib/auth-guard'
import { LANCAMENTOS } from '@/lib/folha-lancamentos'

export const dynamic = 'force-dynamic'

/**
 * Cadastro de itens de avaria (nome + valor de reposição).
 *
 * Quem opera é exatamente quem opera a tela de Avarias — a lista de perfis sai
 * da mesma configuração, para o cadastro não ficar mais aberto que a tela que
 * o usa.
 */
const PERFIS = LANCAMENTOS['avarias'].perfis

function nomeLimpo(v: unknown): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)
}

/** "12,90" ou "12.90" → 12.9 */
function valorNumero(v: unknown): number {
  const texto = String(v ?? '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')
  const n = Number(texto)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : -1
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireAnyRoleApi([...PERFIS])
    if (denied) return denied

    const body = await req.json().catch(() => ({}))
    const nome = nomeLimpo(body.nome)
    const valor = valorNumero(body.valor)
    if (nome.length < 2) return NextResponse.json({ error: 'Informe o nome do item.' }, { status: 400 })
    if (valor < 0) return NextResponse.json({ error: 'Informe um valor válido.' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()
    const { error } = await supabase.from('avaria_itens').insert({ nome, valor })
    if (error) {
      const repetido = error.code === '23505'
      return NextResponse.json(
        { error: repetido ? 'Já existe um item com esse nome.' : error.message },
        { status: repetido ? 409 : 500 },
      )
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[avaria-itens POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/** PUT — renomeia ou muda o valor. O que já foi lançado NÃO muda: a avaria
 *  guarda o texto e o valor do dia em que foi lançada. */
export async function PUT(req: NextRequest) {
  try {
    const denied = await requireAnyRoleApi([...PERFIS])
    if (denied) return denied

    const body = await req.json().catch(() => ({}))
    const id = String(body.id ?? '')
    const nome = nomeLimpo(body.nome)
    const valor = valorNumero(body.valor)
    if (!id || nome.length < 2 || valor < 0) {
      return NextResponse.json({ error: 'Dados incompletos.' }, { status: 400 })
    }

    const supabase = await createSupabaseServiceClient()
    const { error } = await supabase.from('avaria_itens')
      .update({ nome, valor, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) {
      const repetido = error.code === '23505'
      return NextResponse.json(
        { error: repetido ? 'Já existe um item com esse nome.' : error.message },
        { status: repetido ? 409 : 500 },
      )
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[avaria-itens PUT]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/** DELETE — tira o item da lista. Avarias já lançadas ficam como estão. */
export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireAnyRoleApi([...PERFIS])
    if (denied) return denied

    const id = String((await req.json().catch(() => ({}))).id ?? '')
    if (!id) return NextResponse.json({ error: 'Item não informado.' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()
    const { error } = await supabase.from('avaria_itens').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[avaria-itens DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
