import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { generateDocxFromTemplate } from '@/lib/docx-generate'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const b = await req.json()
    if (!b.title?.trim()) return NextResponse.json({ error: 'Informe o título do contrato.' }, { status: 400 })
    if (!b.contract_date) return NextResponse.json({ error: 'Informe a data do contrato.' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()

    let file_url = b.file_url || null
    let file_name = b.file_name || null
    let file_path = b.file_path || null
    let file_type = b.file_type || (file_name?.split('.').pop()?.toLowerCase() ?? null)

    // Geração a partir de template (.docx)
    if (b.template_id && b.variables && typeof b.variables === 'object') {
      const { data: tpl } = await supabase.from('contract_templates').select('name, file_url, file_type').eq('id', b.template_id).maybeSingle()
      if (!tpl) return NextResponse.json({ error: 'Template não encontrado.' }, { status: 404 })
      if (tpl.file_type !== 'pdf') {
        try {
          const out = await generateDocxFromTemplate(tpl.file_url as string, b.variables as Record<string, string>)
          const path = `contract-templates/gerados/${Date.now()}.docx`
          const { error: upErr } = await supabase.storage.from('admission-docs').upload(path, out, {
            contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', upsert: false,
          })
          if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
          const { data: urlData } = supabase.storage.from('admission-docs').getPublicUrl(path)
          file_url = urlData.publicUrl
          file_name = `${b.title.trim()}.docx`
          file_path = path
          file_type = 'docx'
        } catch (e) {
          return NextResponse.json({ error: `Erro ao gerar o contrato: ${(e as Error).message}` }, { status: 400 })
        }
      }
    }

    const { data, error } = await supabase.from('freelancer_contracts').insert({
      candidate_id: id,
      title: b.title.trim(),
      contract_date: b.contract_date,
      period_start: b.period_start || null,
      period_end: b.period_end || null,
      value: b.value != null && b.value !== '' ? Number(b.value) : null,
      notes: b.notes?.trim() || null,
      file_url, file_name, file_path, file_type,
      template_id: b.template_id || null,
      variables: b.variables || null,
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ contract: data })
  } catch (err) {
    console.error('[contratos POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
