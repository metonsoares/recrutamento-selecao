import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requirePermissionApi } from '@/lib/auth-guard'
import { BUCKET_ANEXOS, PASTA_ANEXOS, MAX_ANEXO_BYTES, TIPOS_ANEXO, extensaoDe } from '@/lib/notas-anexos'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/candidatos/[id]/notes/upload
 *
 * NÃO recebe o arquivo: devolve uma autorização de upload (path + token) para
 * o navegador mandar o arquivo DIRETO ao Supabase Storage.
 *
 * Por quê: a Vercel corta o corpo de qualquer função em ~4,5 MB
 * (FUNCTION_PAYLOAD_TOO_LARGE). Medido em 23/10/2026 no ar: 1 MB passa, 4,4 MB
 * já volta 413. Ou seja, um anexo de 5 MB JAMAIS chegaria aqui se o arquivo
 * viesse no corpo — o limite pedido pelo dono só é possível subindo direto.
 *
 * O que continua do lado do servidor: a permissão, o nome do objeto e a pasta
 * (o navegador não escolhe onde grava). O tamanho real é conferido de novo
 * quando a observação é salva, lendo o objeto no bucket.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requirePermissionApi('candidatos.ver')
    if (denied) return denied

    const { id } = await ctx.params
    if (!id) return NextResponse.json({ error: 'Candidato não informado.' }, { status: 400 })

    const { name, type, size } = await req.json().catch(() => ({})) as {
      name?: string; type?: string; size?: number
    }

    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Arquivo sem nome.' }, { status: 400 })
    }
    if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
      return NextResponse.json({ error: 'O arquivo está vazio.' }, { status: 400 })
    }
    if (size > MAX_ANEXO_BYTES) {
      return NextResponse.json({
        error: `"${name}" tem ${(size / 1024 / 1024).toFixed(1)} MB. O limite é 5 MB por arquivo.`,
      }, { status: 400 })
    }
    if (typeof type !== 'string' || !TIPOS_ANEXO.includes(type)) {
      return NextResponse.json({
        error: 'Formato não aceito. Use PDF, imagem (JPG, PNG, WEBP, HEIC), Word ou Excel.',
      }, { status: 400 })
    }

    // Nome do objeto: carimbo + sorteio. O nome original fica só no banco —
    // acentos e espaços no path do Storage dão dor de cabeça na hora de assinar.
    const objeto = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensaoDe(name, type)}`
    const path = `${PASTA_ANEXOS}/${id}/${objeto}`

    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase.storage
      .from(BUCKET_ANEXOS)
      .createSignedUploadUrl(path)

    if (error || !data?.token) {
      console.error('[notes upload sign]', error)
      return NextResponse.json({ error: 'Não foi possível preparar o envio.' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      bucket: BUCKET_ANEXOS,
      path,
      token: data.token,
      anexo: { name: name.slice(0, 200), path, size, type },
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
