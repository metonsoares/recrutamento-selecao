import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { name, phone, windows } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: 'Nome obrigatório.' }, { status: 400 })
    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase.from('interviewers')
      .update({ name: name.trim(), phone: phone?.trim() || null, ...(Array.isArray(windows) ? { windows } : {}) })
      .eq('id', id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ interviewer: data })
  } catch { return NextResponse.json({ error: 'Erro interno.' }, { status: 500 }) }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServiceClient()
  const { error } = await supabase.from('interviewers').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
