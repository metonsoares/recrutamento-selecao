import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { generateToken } from '@/lib/helpers'

export async function GET() {
  try {
    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('climate_surveys')
      .select('*, climate_responses(count)')
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ surveys: data })
  } catch (err) {
    console.error('[climate-surveys GET]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json()
    if (!b.title?.trim()) return NextResponse.json({ error: 'Título obrigatório.' }, { status: 400 })
    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('climate_surveys')
      .insert({
        title: b.title.trim(),
        description: b.description || null,
        company_name: b.company_name || null,
        target_statuses: b.target_statuses || [],
        target_candidate_ids: b.target_candidate_ids || [],
        questions: b.questions || [],
        token: generateToken(),
        active: true,
      })
      .select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ survey: data })
  } catch (err) {
    console.error('[climate-surveys POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
