import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

export async function GET() {
  try {
    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ companies: data })
  } catch (err) {
    console.error('[companies GET]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('companies')
      .insert({ ...body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ company: data })
  } catch (err) {
    console.error('[companies POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
