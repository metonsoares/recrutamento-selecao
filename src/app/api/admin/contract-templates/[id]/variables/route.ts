import { NextRequest, NextResponse } from 'next/server'
import mammoth from 'mammoth'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const maxDuration = 30

/** Extrai as variáveis {tag} do texto de um .docx (aceita espaços e acentos). */
function extractTags(text: string): string[] {
  return Array.from(new Set(
    [...text.matchAll(/\{([^{}\n]{1,60}?)\}/g)].map(m => m[1].trim()).filter(Boolean)
  ))
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createSupabaseServiceClient()
    const { data: tpl } = await supabase.from('contract_templates').select('*').eq('id', id).maybeSingle()
    if (!tpl) return NextResponse.json({ error: 'Template não encontrado.' }, { status: 404 })
    if (tpl.file_type === 'pdf') {
      return NextResponse.json({ variables: [], mappings: tpl.field_mappings || {}, pdf: true })
    }

    const res = await fetch(tpl.file_url as string)
    if (!res.ok) return NextResponse.json({ error: 'Não foi possível ler o arquivo do template.' }, { status: 502 })
    const buf = Buffer.from(await res.arrayBuffer())
    const { value: text } = await mammoth.extractRawText({ buffer: buf })
    const variables = extractTags(text)

    return NextResponse.json({ variables, mappings: tpl.field_mappings || {} })
  } catch (err) {
    console.error('[contract-templates variables GET]', err)
    return NextResponse.json({ error: 'Erro ao ler o template.' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { mappings } = await req.json()
    if (!mappings || typeof mappings !== 'object') {
      return NextResponse.json({ error: 'Mapeamento inválido.' }, { status: 400 })
    }
    const supabase = await createSupabaseServiceClient()
    const { error } = await supabase.from('contract_templates').update({ field_mappings: mappings }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[contract-templates variables PUT]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
