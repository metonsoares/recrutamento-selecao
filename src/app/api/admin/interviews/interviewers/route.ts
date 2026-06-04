import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = await createSupabaseServiceClient()
  const { data, error } = await supabase.from('interviewers').select('*').order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ interviewers: data })
}

export async function POST(req: NextRequest) {
  try {
    const { name, phone, windows } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: 'Nome do entrevistador é obrigatório.' }, { status: 400 })
    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase.from('interviewers')
      .insert({ name: name.trim(), phone: phone?.trim() || null, windows: Array.isArray(windows) ? windows : [] }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ interviewer: data })
  } catch { return NextResponse.json({ error: 'Erro interno.' }, { status: 500 }) }
}
