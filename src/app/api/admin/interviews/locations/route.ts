import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = await createSupabaseServiceClient()
  const { data, error } = await supabase.from('interview_locations').select('*').order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ locations: data })
}

export async function POST(req: NextRequest) {
  try {
    const { name, address } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: 'Nome do local é obrigatório.' }, { status: 400 })
    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase.from('interview_locations')
      .insert({ name: name.trim(), address: address?.trim() || null }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ location: data })
  } catch { return NextResponse.json({ error: 'Erro interno.' }, { status: 500 }) }
}
