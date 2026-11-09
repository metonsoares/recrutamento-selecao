import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requirePermissionApi } from '@/lib/auth-guard'
import {
  BUCKET_FOLHAS, MAX_FOLHA_BYTES, ehPdf, objetoDaFolha, tamanhoDaFolha,
} from '@/lib/folhas-analiticas'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/folhas-analiticas/assinar
 *
 * NÃO recebe o arquivo: devolve a autorização (path + token) para o navegador
 * subir a folha DIRETO ao Supabase Storage.
 *
 * Por quê: a Vercel corta o corpo de qualquer função em ~4,5 MB
 * (FUNCTION_PAYLOAD_TOO_LARGE — 1 MB passa, 4,4 MB já volta 413, medido no ar).
 * A tela promete 25 MB por folha, e folha analítica digitalizada passa de 4,5 MB
 * com facilidade: pelo corpo da função o envio era impossível e a tela só
 * mostrava "Erro ao enviar" porque o 413 da Vercel nem é JSON.
 *
 * Fica no servidor o que importa: a permissão e o nome/pasta do objeto.
 */
export async function POST(req: NextRequest) {
  try {
    const denied = await requirePermissionApi('documentos_empresa')
    if (denied) return denied

    const { name, type, size, competencia } = await req.json().catch(() => ({})) as {
      name?: string; type?: string; size?: number; competencia?: string
    }

    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Arquivo sem nome.' }, { status: 400 })
    }
    if (typeof competencia !== 'string' || !/^\d{4}-\d{2}-01$/.test(competencia)) {
      return NextResponse.json({ error: 'Informe o período (mês e ano).' }, { status: 400 })
    }
    if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
      return NextResponse.json({ error: `"${name}" está vazio.` }, { status: 400 })
    }
    if (size > MAX_FOLHA_BYTES) {
      return NextResponse.json({
        error: `"${name}" tem ${tamanhoDaFolha(size)}. O limite é 25 MB por arquivo.`,
      }, { status: 400 })
    }
    if (!ehPdf(name, typeof type === 'string' ? type : '')) {
      return NextResponse.json({ error: `"${name}" não é PDF.` }, { status: 400 })
    }

    const path = objetoDaFolha(competencia, name)

    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase.storage
      .from(BUCKET_FOLHAS)
      .createSignedUploadUrl(path)

    if (error || !data?.token) {
      console.error('[folhas-analiticas assinar]', error)
      return NextResponse.json({ error: 'Não foi possível preparar o envio.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, bucket: BUCKET_FOLHAS, path, token: data.token })
  } catch (err) {
    console.error('[folhas-analiticas assinar POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
