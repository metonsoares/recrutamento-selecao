import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requirePermissionApi } from '@/lib/auth-guard'
import { getEffectiveRole } from '@/lib/portal-perfil'
import { calcularAvisosDePrazo, gravarNotificacoes } from '@/lib/notificacoes'

export const dynamic = 'force-dynamic'

/** Avisos com mais de 60 dias somem da lista — o sino é do que é acionável agora. */
const JANELA_DIAS = 60

/** GET — recalcula os avisos de prazo e devolve a lista com a contagem de não lidos. */
export async function GET() {
  try {
    const denied = await requirePermissionApi('candidatos.ver')
    if (denied) return denied

    const service = await createSupabaseServiceClient()
    await gravarNotificacoes(service, await calcularAvisosDePrazo(service))

    const desde = new Date(Date.now() - JANELA_DIAS * 86400000).toISOString()
    const { data, error } = await service
      .from('notificacoes')
      .select('id, tipo, titulo, descricao, url, criada_em, lida_em')
      .gte('criada_em', desde)
      .order('criada_em', { ascending: false })
      .limit(50)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const itens = data ?? []
    return NextResponse.json({
      ok: true,
      itens,
      naoLidas: itens.filter(i => !i.lida_em).length,
    })
  } catch (err) {
    console.error('[notificacoes GET]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/** PUT — marca um aviso como lido, ou todos de uma vez. */
export async function PUT(req: NextRequest) {
  try {
    const denied = await requirePermissionApi('candidatos.ver')
    if (denied) return denied

    const { user } = await getEffectiveRole()
    const body = await req.json().catch(() => ({}))
    const service = await createSupabaseServiceClient()
    const marca = { lida_em: new Date().toISOString(), lida_por: user?.email ?? null }

    const q = service.from('notificacoes').update(marca).is('lida_em', null)
    const { error } = body?.todas === true ? await q : await q.eq('id', String(body?.id ?? ''))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[notificacoes PUT]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
