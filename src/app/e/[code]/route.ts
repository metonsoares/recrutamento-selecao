import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const supabase = await createSupabaseServiceClient()
  const { data } = await supabase.from('interview_invites').select('token').eq('short_code', code).maybeSingle()
  const origin = new URL(req.url).origin
  if (!data?.token) return NextResponse.redirect(`${origin}/entrevista/invalido`)
  return NextResponse.redirect(`${origin}/entrevista/${data.token}`)
}
