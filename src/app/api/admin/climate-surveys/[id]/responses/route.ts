import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createSupabaseServiceClient()
    const { data: survey } = await supabase.from('climate_surveys').select('*').eq('id', id).maybeSingle()
    if (!survey) return NextResponse.json({ error: 'Pesquisa não encontrada.' }, { status: 404 })

    const { data: responses } = await supabase
      .from('climate_responses').select('*').eq('survey_id', id).order('created_at', { ascending: false })

    // nomes dos respondentes identificados
    const ids = [...new Set((responses || []).map(r => r.candidate_id).filter(Boolean))] as string[]
    const nameMap: Record<string, string> = {}
    if (ids.length) {
      const { data: cands } = await supabase.from('candidates').select('id, full_name').in('id', ids)
      for (const c of cands || []) nameMap[c.id] = c.full_name
    }

    return NextResponse.json({ survey, responses: responses || [], nameMap })
  } catch (err) {
    console.error('[climate responses GET]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
