import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requirePermissionApi } from '@/lib/auth-guard'
import { BUCKET_ANEXOS, PASTA_ANEXOS, MAX_ANEXO_BYTES, TIPOS_ANEXO, extensaoDe } from '@/lib/notas-anexos'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/candidatos/[id]/notes/upload
 *
 * Sobe UM anexo da observação interna e devolve a ficha do arquivo
 * ({ name, path, size, type }) para a tela guardar junto da anotação.
 * O arquivo vai para um bucket PRIVADO — nada de URL pública: quem baixa
 * passa por /notes/anexo, que assina uma URL de curta duração.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requirePermissionApi('candidatos.ver')
    if (denied) return denied

    const { id } = await ctx.params
    if (!id) return NextResponse.json({ error: 'Candidato não informado.' }, { status: 400 })

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 })
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'O arquivo está vazio.' }, { status: 400 })
    }
    if (file.size > MAX_ANEXO_BYTES) {
      return NextResponse.json({
        error: `"${file.name}" tem ${(file.size / 1024 / 1024).toFixed(1)} MB. O limite é 5 MB por arquivo.`,
      }, { status: 400 })
    }
    if (!TIPOS_ANEXO.includes(file.type)) {
      return NextResponse.json({
        error: 'Formato não aceito. Use PDF, imagem (JPG, PNG, WEBP, HEIC), Word ou Excel.',
      }, { status: 400 })
    }

    // Nome do objeto: carimbo + sorteio. O nome original fica só no banco —
    // acentos e espaços no path do Storage dão dor de cabeça na hora de assinar.
    const nome = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensaoDe(file.name, file.type)}`
    const path = `${PASTA_ANEXOS}/${id}/${nome}`

    const supabase = await createSupabaseServiceClient()
    const { error } = await supabase.storage
      .from(BUCKET_ANEXOS)
      .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false })

    if (error) {
      console.error('[notes upload]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      anexo: { name: file.name, path, size: file.size, type: file.type },
    })
  } catch (err) {
    console.error('[notes upload POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/**
 * DELETE — remove um anexo que ainda não foi salvo (a pessoa anexou e desistiu).
 * Sem isto, todo arquivo descartado antes de "Salvar Observação" ficaria órfão
 * no bucket para sempre.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requirePermissionApi('candidatos.ver')
    if (denied) return denied

    const { id } = await ctx.params
    const { path } = await req.json().catch(() => ({})) as { path?: string }
    if (!path) return NextResponse.json({ error: 'path obrigatório.' }, { status: 400 })

    // Só apaga dentro da pasta DESTE candidato — o path vem do navegador.
    if (!path.startsWith(`${PASTA_ANEXOS}/${id}/`)) {
      return NextResponse.json({ error: 'Anexo fora da pasta deste candidato.' }, { status: 403 })
    }

    const supabase = await createSupabaseServiceClient()
    const { error } = await supabase.storage.from(BUCKET_ANEXOS).remove([path])
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[notes upload DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
