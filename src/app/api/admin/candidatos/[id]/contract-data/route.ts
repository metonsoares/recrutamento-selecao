import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requirePermissionApi } from '@/lib/auth-guard'

interface ReceiptFile { url?: string; name?: string; path?: string }
interface Adjustment { type?: string; description?: string; receipt?: ReceiptFile | null }
interface CustomDoc { id: string; name: string; files: Array<{ url: string; name: string; path: string }> }

/**
 * Copia os recibos dos Dados para contrato (adiantamentos + quitação de
 * contrato) para company_docs.__recibos — o quadro "Recibos" da aba Documentos.
 * Dedupe por path/url: salvar o contrato de novo não duplica o recibo.
 * Retorna o company_docs atualizado, ou null se não houver nada novo.
 */
function mergeContractReceipts(companyDocs: unknown, contractData: unknown): Record<string, unknown> | null {
  const cd = (contractData ?? {}) as { adjustments?: Adjustment[]; quitacao_file?: ReceiptFile | null }

  const entries: Array<{ name: string; file: ReceiptFile }> = []
  if (Array.isArray(cd.adjustments)) {
    for (const a of cd.adjustments) {
      if (a?.type === 'adiantamento' && a?.receipt?.url) {
        entries.push({
          name: a.description?.trim() ? `Adiantamento — ${a.description.trim()}` : 'Adiantamento',
          file: a.receipt,
        })
      }
    }
  }
  if (cd.quitacao_file?.url) entries.push({ name: 'Quitação de contrato', file: cd.quitacao_file })
  if (entries.length === 0) return null

  const docs: Record<string, unknown> =
    companyDocs && typeof companyDocs === 'object' ? { ...(companyDocs as Record<string, unknown>) } : {}
  const recibos: CustomDoc[] = Array.isArray(docs.__recibos) ? [...(docs.__recibos as CustomDoc[])] : []

  const seen = new Set<string>()
  for (const r of recibos) for (const f of r?.files ?? []) { const k = f?.path || f?.url; if (k) seen.add(k) }

  let changed = false
  for (const { name, file } of entries) {
    const key = file.path || file.url || ''
    if (!key || seen.has(key)) continue
    recibos.push({
      id: crypto.randomUUID(),
      name,
      files: [{ url: file.url || '', name: file.name || 'Recibo', path: file.path || '' }],
    })
    seen.add(key)
    changed = true
  }
  if (!changed) return null
  docs.__recibos = recibos
  return docs
}

/**
 * PUT /api/admin/candidatos/[id]/contract-data
 * body: { data: {...contrato}, status?: 'contratado'|'desligado' }
 * Salva contract_data e, opcionalmente, muda o status da candidatura.
 * Recibos de adiantamentos são espelhados em company_docs.__recibos (aba Documentos).
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requirePermissionApi('ficha.contrato')
    if (denied) return denied
    const { id: candidateId } = await params
    const { data: contractData, status } = await req.json()

    const supabase = await createSupabaseServiceClient()
    const { data: app } = await supabase
      .from('applications')
      .select('id, company_docs')
      .eq('candidate_id', candidateId)
      .eq('is_latest', true)
      .maybeSingle()

    if (!app) return NextResponse.json({ error: 'Candidatura não encontrada.' }, { status: 404 })

    const update: Record<string, unknown> = {
      contract_data: contractData,
      updated_at: new Date().toISOString(),
    }
    if (status) update.status = status
    if (status === 'desligado') update.terminated_at = new Date().toISOString()

    // Espelha recibos (adiantamentos + quitação) no quadro "Recibos" (aba Documentos)
    const mergedDocs = mergeContractReceipts(app.company_docs, contractData)
    if (mergedDocs) update.company_docs = mergedDocs

    const { error } = await supabase.from('applications').update(update).eq('id', app.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[contract-data PUT]', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
