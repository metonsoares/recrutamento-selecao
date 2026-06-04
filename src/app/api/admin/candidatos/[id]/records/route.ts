import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('records').select('*').eq('candidate_id', id).order('record_date', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ records: data })
  } catch (err) {
    console.error('[records GET]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { record_date, comment, file_url, file_name, file_path } = await req.json()
    if (!record_date) return NextResponse.json({ error: 'Data é obrigatória.' }, { status: 400 })
    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('records')
      .insert({ candidate_id: id, record_date, comment: comment || null, file_url: file_url || null, file_name: file_name || null, file_path: file_path || null })
      .select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ record: data })
  } catch (err) {
    console.error('[records POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
