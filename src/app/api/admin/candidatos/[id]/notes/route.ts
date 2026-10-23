import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requirePermissionApi } from '@/lib/auth-guard'
import { sanitizarAnexos, BUCKET_ANEXOS, MAX_ANEXO_BYTES } from '@/lib/notas-anexos'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/candidatos/[id]/notes
 *
 * Anotações internas da ficha. Substitui o insert que a tela fazia direto do
 * navegador, que dependia da policy `ALL/authenticated/USING(true)` de
 * `admin_notes` — ou seja, qualquer conta logada podia anotar (e ler) na ficha
 * de qualquer pessoa.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requirePermissionApi('candidatos.ver')
    if (denied) return denied

    const { id } = await ctx.params
    if (!id) return NextResponse.json({ error: 'Candidato não informado.' }, { status: 400 })

    const body = await req.json().catch(() => ({})) as {
      note?: string
      applicationId?: string | null
      attachments?: unknown
    }
    const note = String(body.note ?? '').trim()

    // Anexos (pedido do dono, 23/10/2026). Já subiram por /notes/upload — aqui
    // chega só a ficha de cada arquivo, que é conferida antes de ir ao banco.
    const attachments = sanitizarAnexos(body.attachments, id)
    if (attachments === null) {
      return NextResponse.json({ error: 'Anexos inválidos.' }, { status: 400 })
    }

    // Observação só com anexo é válida: às vezes o documento diz tudo.
    if (!note && attachments.length === 0) {
      return NextResponse.json({ error: 'Escreva uma observação ou anexe um arquivo.' }, { status: 400 })
    }

    const supabase = await createSupabaseServiceClient()

    // O tamanho que vale é o do OBJETO no bucket, não o que o navegador disse:
    // o arquivo sobe direto para o Storage (a Vercel corta corpo acima de
    // ~4,5 MB), então é aqui que se confirma que ele existe e cabe no limite.
    for (const anexo of attachments) {
      const barra = anexo.path.lastIndexOf('/')
      const { data: achados } = await supabase.storage
        .from(BUCKET_ANEXOS)
        .list(anexo.path.slice(0, barra), { search: anexo.path.slice(barra + 1), limit: 1 })

      const bytes = (achados?.[0]?.metadata as { size?: number } | null | undefined)?.size
      if (typeof bytes !== 'number' || bytes <= 0 || bytes > MAX_ANEXO_BYTES) {
        return NextResponse.json({
          error: `O anexo "${anexo.name}" não subiu por completo. Anexe novamente.`,
        }, { status: 400 })
      }
      anexo.size = bytes
    }

    const { data, error } = await supabase
      .from('admin_notes')
      .insert({
        candidate_id: id,
        application_id: body.applicationId || null,
        note,
        attachments,
      })
      .select('id, note, created_at, attachments')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, nota: data })
  } catch (err) {
    console.error('[notes POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
