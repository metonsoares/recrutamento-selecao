import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requirePermissionApi } from '@/lib/auth-guard'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requirePermissionApi('ficha.admissao')
    if (denied) return denied
    const { id } = await params
    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('salary_raises')
      .select('*')
      .eq('candidate_id', id)
      .order('raise_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ raises: data })
  } catch (err) {
    console.error('[salary-raises GET]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requirePermissionApi('ficha.admissao')
    if (denied) return denied
    const { id } = await params
    const b = await req.json()
    if (!b.raise_date) {
      return NextResponse.json({ error: 'Data do aumento é obrigatória.' }, { status: 400 })
    }
    const value = Number(b.new_value)
    if (!Number.isFinite(value) || value <= 0) {
      return NextResponse.json({ error: 'Novo valor de salário inválido.' }, { status: 400 })
    }
    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('salary_raises')
      .insert({
        candidate_id: id,
        raise_date: b.raise_date,
        new_value: Math.round(value * 100) / 100,
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ raise: data })
  } catch (err) {
    console.error('[salary-raises POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
