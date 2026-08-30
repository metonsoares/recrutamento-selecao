import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requirePermissionApi } from '@/lib/auth-guard'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requirePermissionApi('ficha.atestados')
    if (denied) return denied
    const { id } = await params
    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('medical_certificates')
      .select('*')
      .eq('candidate_id', id)
      .order('certificate_date', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ certificates: data })
  } catch (err) {
    console.error('[certificates GET]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requirePermissionApi('ficha.atestados')
    if (denied) return denied
    const { id } = await params
    const { certificate_date, file_url, file_name, file_path, comment } = await req.json()
    if (!certificate_date) {
      return NextResponse.json({ error: 'Data do atestado é obrigatória.' }, { status: 400 })
    }
    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('medical_certificates')
      .insert({
        candidate_id: id,
        certificate_date,
        file_url: file_url || null,
        file_name: file_name || null,
        file_path: file_path || null,
        comment: comment || null,
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ certificate: data })
  } catch (err) {
    console.error('[certificates POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
