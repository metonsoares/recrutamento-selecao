import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requirePermissionApi } from '@/lib/auth-guard'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requirePermissionApi('ficha.admissao')
    if (denied) return denied
    const { id: candidateId } = await params
    const body = await req.json()

    const supabase = await createSupabaseServiceClient()

    // Atualiza admission_form na candidatura mais recente
    const { data: app } = await supabase
      .from('applications')
      .select('id, contract_data')
      .eq('candidate_id', candidateId)
      .eq('is_latest', true)
      .maybeSingle()

    if (!app) return NextResponse.json({ error: 'Candidatura não encontrada.' }, { status: 404 })

    const update: Record<string, unknown> = { admission_form: body, updated_at: new Date().toISOString() }

    // Empresa da ficha ativa = empresa ATUAL do colaborador → espelha em
    // contract_data (aba "Dados para contrato"), decisão do dono na feature
    // "Transferir de empresa". Só grava quando a ficha tem empresa e ela
    // difere da registrada no contrato.
    const fichaCompanyId = typeof body?.selected_company_id === 'string' ? body.selected_company_id : ''
    const contract = (app.contract_data as Record<string, unknown> | null) ?? null
    if (fichaCompanyId && (contract?.company_id ?? '') !== fichaCompanyId) {
      const { data: comp } = await supabase
        .from('companies')
        .select('razao_social, apelido')
        .eq('id', fichaCompanyId)
        .maybeSingle()
      update.contract_data = {
        ...(contract || {}),
        company_id: fichaCompanyId,
        company_name: comp?.razao_social || comp?.apelido || '',
      }
    }

    const { error } = await supabase
      .from('applications')
      .update(update)
      .eq('id', app.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[admission-form PUT]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
