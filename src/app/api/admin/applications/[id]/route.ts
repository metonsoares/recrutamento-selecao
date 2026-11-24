import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requireAnyPermissionApi } from '@/lib/auth-guard'
import { Permission } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/admin/applications/[id]
 *
 * Substitui as escritas que a ficha do candidato fazia direto do navegador:
 * trocar a vaga da candidatura e registrar o desligamento. Antes isso só
 * funcionava pela policy `ALL/authenticated/USING(true)` de `applications`, que
 * deixava qualquer conta logada mudar status e data de desligamento de
 * qualquer pessoa.
 *
 * Autorização por campo, porque são duas ações distintas com permissões
 * distintas na mesma tabela.
 */
const CAMPO_PERMISSOES: Record<string, Permission[]> = {
  job_id:           ['candidatos.editar_vaga'],
  status:              ['acao.desligar'],
  terminated_at:       ['acao.desligar'],
  termination_data:    ['acao.desligar'],
  // Aviso prévio trabalhado: mesma ação, mesmo dono.
  aviso_previo_inicio: ['acao.desligar'],
  aviso_previo_ate:    ['acao.desligar'],
}

/** Data pura `yyyy-mm-dd` (ou nulo, que limpa o campo). */
function dataValida(v: unknown): boolean {
  return v === null || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v))
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    if (!id) return NextResponse.json({ error: 'Candidatura não informada.' }, { status: 400 })

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const campos = Object.keys(body)
    if (campos.length === 0) return NextResponse.json({ error: 'Nada para salvar.' }, { status: 400 })

    const desconhecidos = campos.filter(c => !(c in CAMPO_PERMISSOES))
    if (desconhecidos.length > 0) {
      return NextResponse.json(
        { error: `Campo não permitido: ${desconhecidos.join(', ')}` },
        { status: 400 },
      )
    }

    // Datas do aviso: formato conferido aqui, porque é delas que o cron
    // diário depende para desligar na hora certa.
    for (const campo of ['aviso_previo_inicio', 'aviso_previo_ate'] as const) {
      if (campo in body && !dataValida(body[campo])) {
        return NextResponse.json({ error: `Data inválida em ${campo}.` }, { status: 400 })
      }
    }
    if (typeof body.aviso_previo_inicio === 'string' && typeof body.aviso_previo_ate === 'string'
        && body.aviso_previo_ate < body.aviso_previo_inicio) {
      return NextResponse.json({ error: 'O fim do aviso prévio não pode ser antes do início.' }, { status: 400 })
    }

    // `status` aqui serve ao desligamento. Mudança de etapa do funil continua
    // na rota própria (/applications/[id]/status), com a permissão dela.
    if (typeof body.status === 'string' && body.status !== 'desligado') {
      return NextResponse.json(
        { error: 'Para mudar a etapa do candidato use a ação de status.' },
        { status: 400 },
      )
    }

    for (const campo of campos) {
      const denied = await requireAnyPermissionApi(CAMPO_PERMISSOES[campo])
      if (denied) return denied
    }

    const supabase = await createSupabaseServiceClient()
    const { error } = await supabase
      .from('applications')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[applications PATCH]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
