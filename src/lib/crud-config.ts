import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requireAnyPermissionApi } from '@/lib/auth-guard'
import { Permission } from '@/lib/permissions'

/**
 * Fábrica de rotas para os CADASTROS DE CONFIGURAÇÃO (vagas, perguntas do
 * formulário, seções, perguntas do teste cultural).
 *
 * Essas telas gravavam direto do navegador, o que só funcionava por causa da
 * policy `ALL/authenticated/USING(true)` — ou seja, qualquer conta logada podia
 * reescrever as vagas e as perguntas. Aqui a escrita passa a exigir a mesma
 * permissão que a tela já exige para abrir.
 *
 * A tabela e as colunas permitidas são fixadas pelo arquivo de rota, nunca
 * vêm do pedido: o corpo só pode trazer colunas que estejam em `colunas`.
 */
export type ConfigCrud = {
  /** Tabela alvo — escolhida pela rota, nunca pelo cliente. */
  tabela: string
  /** Basta UMA destas permissões para gravar. */
  perms: Permission[]
  /** Colunas que o corpo do pedido pode trazer. */
  colunas: readonly string[]
}

function limpar(corpo: Record<string, unknown>, colunas: readonly string[]) {
  const dados: Record<string, unknown> = {}
  const recusados: string[] = []
  for (const [k, v] of Object.entries(corpo)) {
    if (k === 'id') continue
    if (colunas.includes(k)) dados[k] = v
    else recusados.push(k)
  }
  return { dados, recusados }
}

export function criarRotasConfig(cfg: ConfigCrud) {
  async function guard() {
    return requireAnyPermissionApi(cfg.perms)
  }

  /** POST — cria um registro. */
  async function POST(req: NextRequest) {
    const denied = await guard()
    if (denied) return denied

    const corpo = await req.json().catch(() => ({})) as Record<string, unknown>
    const { dados, recusados } = limpar(corpo, cfg.colunas)
    if (recusados.length) {
      return NextResponse.json({ error: `Campo não permitido: ${recusados.join(', ')}` }, { status: 400 })
    }
    if (Object.keys(dados).length === 0) {
      return NextResponse.json({ error: 'Nada para criar.' }, { status: 400 })
    }

    const supabase = await createSupabaseServiceClient()
    const agora = new Date().toISOString()
    const { data, error } = await supabase
      .from(cfg.tabela)
      .insert({ ...dados, created_at: agora, updated_at: agora })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, registro: data })
  }

  /** PATCH — altera um registro, ou vários de uma vez (usado na reordenação). */
  async function PATCH(req: NextRequest) {
    const denied = await guard()
    if (denied) return denied

    const corpo = await req.json().catch(() => ({})) as Record<string, unknown>

    // Reordenar troca o `sort_order` de dois itens; mandar os dois juntos evita
    // deixar a lista com ordem repetida se o segundo pedido falhar.
    const lote = Array.isArray(corpo.itens) ? corpo.itens as Array<Record<string, unknown>> : null
    const pedidos = lote ?? [corpo]

    const supabase = await createSupabaseServiceClient()
    for (const p of pedidos) {
      const id = String(p.id ?? '')
      if (!id) return NextResponse.json({ error: 'Registro não informado.' }, { status: 400 })
      const { dados, recusados } = limpar(p, cfg.colunas)
      if (recusados.length) {
        return NextResponse.json({ error: `Campo não permitido: ${recusados.join(', ')}` }, { status: 400 })
      }
      const { error } = await supabase
        .from(cfg.tabela)
        .update({ ...dados, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  /** DELETE — remove um registro. */
  async function DELETE(req: NextRequest) {
    const denied = await guard()
    if (denied) return denied

    const id = String((await req.json().catch(() => ({})) as { id?: string }).id ?? '')
    if (!id) return NextResponse.json({ error: 'Registro não informado.' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()
    const { error } = await supabase.from(cfg.tabela).delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return { POST, PATCH, DELETE }
}
