import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { survey_id } = await req.json()
    if (!survey_id) return NextResponse.json({ error: 'survey_id obrigatório.' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()

    // Evita repetição
    const { data: existing } = await supabase
      .from('climate_assignments').select('id').eq('candidate_id', id).eq('survey_id', survey_id).maybeSingle()
    if (existing) return NextResponse.json({ error: 'Esta pesquisa já foi adicionada.' }, { status: 409 })

    const { data, error } = await supabase
      .from('climate_assignments')
      .insert({ candidate_id: id, survey_id })
      .select('*, climate_surveys(title, token)')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ assignment: data })
  } catch (err) {
    console.error('[climate-assignments POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
