import Link from 'next/link'
import { requireMaster } from '@/lib/auth-guard'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { formatName } from '@/lib/helpers'
import { Gift, CheckCircle2, Clock, ExternalLink } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface Linha {
  candidateId: string
  nome: string
  cargo: string | null
  empresa: string | null
  arquivos: number
}

// Exclusivo do Master. Lista os colaboradores CONTRATADOS elegíveis ao
// Prêmio Caju — quem está com "Não aplicável" marcado no documento fica fora.
export default async function PremioCajuPage() {
  await requireMaster()

  const supabase = await createSupabaseServiceClient()

  const [{ data: apps }, { data: empresas }] = await Promise.all([
    supabase
      .from('applications')
      .select('candidate_id, admission_form, company_docs')
      .eq('is_latest', true)
      .eq('status', 'contratado'),
    supabase.from('companies').select('id, apelido, razao_social'),
  ])

  const appsList = apps ?? []
  const candIds = appsList.map(a => a.candidate_id as string).filter(Boolean)

  const { data: cands } = candIds.length
    ? await supabase.from('candidates').select('id, full_name, deleted_at').in('id', candIds)
    : { data: [] as { id: string; full_name: string; deleted_at: string | null }[] }

  const candPorId = new Map((cands ?? []).map(c => [c.id as string, c]))
  const empresaPorId = new Map(
    (empresas ?? []).map(e => [e.id as string, (e.apelido as string) || (e.razao_social as string) || '']),
  )

  const linhas: Linha[] = appsList
    .map(a => {
      const c = candPorId.get(a.candidate_id as string)
      if (!c || c.deleted_at) return null

      const docs = a.company_docs as Record<string, unknown> | null
      const caju = docs?.premio_caju as { not_applicable?: boolean; files?: unknown[] } | undefined
      if (caju?.not_applicable === true) return null // "Não aplicável" não entra na lista

      const af = a.admission_form as Record<string, unknown> | null
      const empresaId = String(af?.selected_company_id ?? '')
      return {
        candidateId: a.candidate_id as string,
        nome: c.full_name,
        cargo: String(af?.function_title ?? '').trim() || null,
        empresa: empresaPorId.get(empresaId) ?? null,
        arquivos: Array.isArray(caju?.files) ? caju!.files!.length : 0,
      }
    })
    .filter(Boolean) as Linha[]

  linhas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const comDocumento = linhas.filter(l => l.arquivos > 0).length

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Gift className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-2xl font-bold leading-tight">Prêmio Caju</h1>
          <p className="text-sm text-muted-foreground">
            Colaboradores contratados elegíveis — quem está marcado como “Não aplicável” fica fora da lista.
          </p>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border bg-white p-3.5 shadow-sm">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Elegíveis</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">{linhas.length}</p>
        </div>
        <div className="rounded-xl border bg-white p-3.5 shadow-sm">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Com documento</p>
          <p className="text-2xl font-bold text-emerald-700 mt-0.5">{comDocumento}</p>
        </div>
        <div className="rounded-xl border bg-white p-3.5 shadow-sm col-span-2 sm:col-span-1">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Pendentes</p>
          <p className="text-2xl font-bold text-amber-600 mt-0.5">{linhas.length - comDocumento}</p>
        </div>
      </div>

      {/* Lista */}
      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">Colaborador</th>
                <th className="px-4 py-2.5 font-semibold">Cargo</th>
                <th className="px-4 py-2.5 font-semibold hidden sm:table-cell">Empresa</th>
                <th className="px-4 py-2.5 font-semibold">Documento</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {linhas.map(l => (
                <tr key={l.candidateId} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{formatName(l.nome)}</td>
                  <td className="px-4 py-2.5 text-gray-600">{l.cargo ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-600 hidden sm:table-cell">{l.empresa ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    {l.arquivos > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {l.arquivos} arquivo{l.arquivos !== 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-amber-600">
                        <Clock className="w-3.5 h-3.5" />Pendente
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/admin/candidatos/${l.candidateId}?tab=documentos`}
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
                    >
                      Abrir ficha<ExternalLink className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))}
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    Nenhum colaborador elegível.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
