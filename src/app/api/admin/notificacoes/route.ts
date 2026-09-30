import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requirePermissionApi } from '@/lib/auth-guard'
import { getEffectiveRole } from '@/lib/portal-perfil'
import { calcularAvisosDePrazo, gravarNotificacoes } from '@/lib/notificacoes'

export const dynamic = 'force-dynamic'

/** Avisos com mais de 60 dias somem da lista — o sino é do que é acionável agora. */
const JANELA_DIAS = 60

/**
 * Sino de avisos.
 *
 * A leitura é POR PESSOA: marcar como lido esconde o aviso de quem leu e deixa
 * o dos colegas intacto. Por isso a lista devolve só o que a pessoa ainda não
 * leu — o que ela já viu sai de vez.
 */
export async function GET() {
  try {
    const denied = await requirePermissionApi('candidatos.ver')
    if (denied) return denied

    const { user } = await getEffectiveRole()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const service = await createSupabaseServiceClient()
    await gravarNotificacoes(service, await calcularAvisosDePrazo(service))

    const desde = new Date(Date.now() - JANELA_DIAS * 86400000).toISOString()
    const { data, error } = await service
      .from('notificacoes')
      .select('id, tipo, titulo, descricao, url, criada_em')
      .gte('criada_em', desde)
      .order('criada_em', { ascending: false })
      .limit(80)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const todos = data ?? []
    const { data: lidas } = todos.length
      ? await service.from('notificacao_leituras')
          .select('notificacao_id')
          .eq('user_id', user.id)
          .in('notificacao_id', todos.map(n => n.id as string))
      : { data: [] as { notificacao_id: string }[] }

    const jaLidas = new Set((lidas ?? []).map(l => l.notificacao_id as string))
    const itens = todos.filter(n => !jaLidas.has(n.id as string)).slice(0, 50)

    return NextResponse.json({ ok: true, itens, naoLidas: itens.length })
  } catch (err) {
    console.error('[notificacoes GET]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/** PUT — marca como lido para QUEM chamou: um aviso, ou todos os que ele vê. */
export async function PUT(req: NextRequest) {
  try {
    const denied = await requirePermissionApi('candidatos.ver')
    if (denied) return denied

    const { user } = await getEffectiveRole()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const service = await createSupabaseServiceClient()

    let ids: string[] = []
    if (body?.todas === true) {
      const desde = new Date(Date.now() - JANELA_DIAS * 86400000).toISOString()
      const { data } = await service.from('notificacoes').select('id').gte('criada_em', desde)
      ids = (data ?? []).map(n => n.id as string)
    } else if (typeof body?.id === 'string' && body.id) {
      ids = [body.id]
    }
    if (!ids.length) return NextResponse.json({ ok: true })

    // Já lido é estado, não evento: repetir a marcação não pode dar erro.
    const { error } = await service.from('notificacao_leituras').upsert(
      ids.map(id => ({ notificacao_id: id, user_id: user.id, user_email: user.email ?? null })),
      { onConflict: 'notificacao_id,user_id', ignoreDuplicates: true },
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[notificacoes PUT]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
