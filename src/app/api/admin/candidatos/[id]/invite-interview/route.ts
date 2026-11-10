import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { enviarWhatsApp, primeiroNome, TEMPLATE_CONVITE } from '@/lib/whatsapp'

/**
 * Avisa o candidato de que o currículo chegou.
 *
 * Desde 10/11/2026 sai pelo número oficial da empresa (Portal BDT), com o
 * modelo aprovado `convite_entrevista` — a Meta não aceita texto livre para
 * quem não falou com a gente nas últimas 24h.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createSupabaseServiceClient()

    const { data: candidate } = await supabase
      .from('candidates').select('id, full_name, phone').eq('id', id).maybeSingle()
    if (!candidate) return NextResponse.json({ ok: false, error: 'Candidato não encontrado.' }, { status: 404 })
    if (!candidate.phone) {
      return NextResponse.json({ ok: false, error: 'Candidato sem telefone cadastrado.' }, { status: 400 })
    }

    const envio = await enviarWhatsApp({
      numero: candidate.phone as string,
      template: TEMPLATE_CONVITE,
      variaveis: [primeiroNome(candidate.full_name as string)],
      nome: candidate.full_name as string,
      referencia: candidate.id as string,
      acao: 'invite_interview',
    })

    if (!envio.ok) {
      return NextResponse.json({ ok: false, error: envio.erro, motivo: envio.motivo }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[invite-interview]', err)
    return NextResponse.json({ ok: false, error: 'Erro interno.' }, { status: 500 })
  }
}
