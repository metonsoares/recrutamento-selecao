import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { interpretClimateResponse } from '@/lib/climate-interpret'

export const maxDuration = 35

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { responseId } = await req.json()
    if (!responseId) return NextResponse.json({ error: 'responseId obrigatório.' }, { status: 400 })

    const supabase = await createSupabaseServiceClient()
    const analysis = await interpretClimateResponse(supabase, id, responseId)
    if (!analysis) {
      return NextResponse.json({ analysis: 'Não foi possível gerar a análise. Verifique a chave de IA em Configuração IA e tente novamente.' })
    }
    return NextResponse.json({ analysis })
  } catch (err) {
    console.error('[climate analyze-response]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
