import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requireMasterApi } from '@/lib/auth-guard'

/**
 * PUT — define o peso do colaborador no rateio de gorjetas.
 * O peso vem da FUNÇÃO e não muda a cada mês, por isso fica guardado por
 * colaborador (gorjeta_pesos) e se repete nos fechamentos seguintes.
 */
export async function PUT(req: NextRequest) {
  try {
    const denied = await requireMasterApi()
    if (denied) return denied

    const body = await req.json().catch(() => ({}))
    const candidateId = String(body.candidate_id ?? '')
    const peso = Number(body.peso)

    if (!candidateId) return NextResponse.json({ error: 'Colaborador não informado.' }, { status: 400 })
    if (!Number.isFinite(peso) || peso < 0 || peso > 10) {
      return NextResponse.json({ error: 'Peso deve ficar entre 0 e 10.' }, { status: 400 })
    }

    const supabase = await createSupabaseServiceClient()
    const { error } = await supabase
      .from('gorjeta_pesos')
      .upsert({
        candidate_id: candidateId,
        peso: Math.round(peso * 100) / 100,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'candidate_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[gorjetas peso PUT]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
