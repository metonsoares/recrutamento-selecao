import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'

export const runtime = 'nodejs'
export const maxDuration = 30

async function generateFromTemplate(templateUrl: string, variables: Record<string, string>): Promise<Buffer> {
  const res = await fetch(templateUrl)
  if (!res.ok) throw new Error('Falha ao baixar o template.')
  const buf = Buffer.from(await res.arrayBuffer())
  const zip = new PizZip(buf)
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' })
  doc.render(variables)
  return doc.getZip().generate({ type: 'nodebuffer' }) as Buffer
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; contractId: string }> }) {
  try {
    const { id, contractId } = await params
    const b = await req.json()
    if (!b.title?.trim()) return NextResponse.json({ error: 'Informe o título do contrato.' }, { status: 400 })
    if (!b.contract_date) return NextResponse.json({ error: 'Informe a data do contrato.' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()
    const update: Record<string, unknown> = {
      title: b.title.trim(),
      contract_date: b.contract_date,
      period_start: b.period_start || null,
      period_end: b.period_end || null,
      value: b.value != null && b.value !== '' ? Number(b.value) : null,
      notes: b.notes?.trim() || null,
    }

    // Regenera o .docx se for baseado em template e houver variáveis
    if (b.template_id && b.variables && typeof b.variables === 'object') {
      const { data: tpl } = await supabase.from('contract_templates').select('file_url, file_type').eq('id', b.template_id).maybeSingle()
      if (tpl && tpl.file_type !== 'pdf') {
        try {
          const { data: old } = await supabase.from('freelancer_contracts').select('file_path').eq('id', contractId).maybeSingle()
          const out = await generateFromTemplate(tpl.file_url as string, b.variables as Record<string, string>)
          const path = `contract-templates/gerados/${Date.now()}.docx`
          const { error: upErr } = await supabase.storage.from('admission-docs').upload(path, out, {
            contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', upsert: false,
          })
          if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
          const { data: urlData } = supabase.storage.from('admission-docs').getPublicUrl(path)
          update.file_url = urlData.publicUrl
          update.file_name = `${b.title.trim()}.docx`
          update.file_path = path
          update.file_type = 'docx'
          update.variables = b.variables
          update.template_id = b.template_id
          if (old?.file_path) { try { await supabase.storage.from('admission-docs').remove([old.file_path as string]) } catch { /* ignora */ } }
        } catch (e) {
          return NextResponse.json({ error: `Erro ao gerar o contrato: ${(e as Error).message}` }, { status: 400 })
        }
      }
    }

    const { data, error } = await supabase.from('freelancer_contracts').update(update).eq('id', contractId).eq('candidate_id', id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ contract: data })
  } catch (err) {
    console.error('[contratos PUT]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; contractId: string }> }) {
  try {
    const { id, contractId } = await params
    const supabase = await createSupabaseServiceClient()
    const { data: c } = await supabase.from('freelancer_contracts').select('file_path').eq('id', contractId).maybeSingle()
    if (c?.file_path) { try { await supabase.storage.from('admission-docs').remove([c.file_path as string]) } catch { /* ignora */ } }
    const { error } = await supabase.from('freelancer_contracts').delete().eq('id', contractId).eq('candidate_id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[contratos DELETE]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
