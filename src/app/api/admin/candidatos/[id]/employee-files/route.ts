import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requirePermissionApi } from '@/lib/auth-guard'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requirePermissionApi('ficha.documentos')
    if (denied) return denied
    const { id } = await params
    const kind = req.nextUrl.searchParams.get('kind')
    const supabase = await createSupabaseServiceClient()
    let q = supabase.from('employee_files').select('*').eq('candidate_id', id)
    if (kind) q = q.eq('kind', kind)
    const { data, error } = await q.order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ files: data })
  } catch (err) {
    console.error('[employee-files GET]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requirePermissionApi('ficha.documentos')
    if (denied) return denied
    const { id } = await params
    const { kind, reference, file_url, file_name, file_path } = await req.json()
    if (!kind) return NextResponse.json({ error: 'Tipo obrigatório.' }, { status: 400 })
    const supabase = await createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('employee_files')
      .insert({ candidate_id: id, kind, reference: reference || null, file_url: file_url || null, file_name: file_name || null, file_path: file_path || null })
      .select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ file: data })
  } catch (err) {
    console.error('[employee-files POST]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
