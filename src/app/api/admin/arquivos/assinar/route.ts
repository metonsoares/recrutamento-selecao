import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requireAnyRoleApi } from '@/lib/auth-guard'

/**
 * Devolve uma URL assinada, de vida curta, para um arquivo no Storage.
 *
 * Existe para os buckets deixarem de ser públicos: `admission-docs` guarda RG,
 * CPF, CNH e contratos assinados, e enquanto for público qualquer pessoa com a
 * chave publishable lista e baixa tudo.
 *
 * A assinatura é feita NO GESTO (no clique), nunca no render: URL assinada
 * criada ao desenhar a tela vira um cronômetro contra o usuário — a aba fica
 * aberta, o prazo vence e o link morre na mão dele.
 */

/** Só estes buckets podem ser assinados por aqui. */
const BUCKETS = new Set(['admission-docs', 'candidatos-arquivos', 'folhas-analiticas'])

/** Prazo curto: o link é usado no clique seguinte, não guardado. */
const VALIDADE_SEGUNDOS = 300

export async function POST(req: NextRequest) {
  try {
    const denied = await requireAnyRoleApi(['master', 'admin', 'gestor_rh', 'gestor'])
    if (denied) return denied

    const body = await req.json().catch(() => ({}))
    const bucket = String(body.bucket ?? '')
    const path = String(body.path ?? '')

    if (!BUCKETS.has(bucket)) {
      return NextResponse.json({ error: 'Bucket não permitido.' }, { status: 400 })
    }
    // Sem isto, um path com ".." ou absoluto poderia escapar da pasta.
    if (!path || path.includes('..') || path.startsWith('/')) {
      return NextResponse.json({ error: 'Caminho inválido.' }, { status: 400 })
    }

    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, VALIDADE_SEGUNDOS)

    if (error || !data?.signedUrl) {
      return NextResponse.json(
        { error: error?.message || 'Não foi possível abrir o arquivo.' },
        { status: 404 },
      )
    }
    return NextResponse.json({ url: data.signedUrl })
  } catch (err) {
    console.error('[arquivos/assinar]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
