import { redirect } from 'next/navigation'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { normalizeRole } from '@/lib/permissions'
import { AuditoriaManager, AuditLog } from './auditoria-manager'

export const dynamic = 'force-dynamic'

export default async function AuditoriaPage() {
  const auth = await createSupabaseServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')
  const isMaster = normalizeRole(user.user_metadata?.role as string | undefined) === 'master'
  if (!isMaster) redirect('/admin')

  const service = await createSupabaseServiceClient()
  const { data: logs } = await service
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(2000)

  // ── Enriquecimento: nome do candidato envolvido em cada atividade ──
  // Extrai IDs de candidato (/candidatos/{id}) e de candidatura (/applications/{id}) dos caminhos.
  const reCand = /\/candidatos\/([0-9a-f-]{36})/i
  const reApp = /\/applications\/([0-9a-f-]{36})/i
  const candidateIds = new Set<string>()
  const appIds = new Set<string>()
  for (const l of logs || []) {
    const p = (l as { path?: string | null }).path
    if (!p) continue
    const mC = p.match(reCand); if (mC) candidateIds.add(mC[1].toLowerCase())
    const mA = p.match(reApp); if (mA) appIds.add(mA[1].toLowerCase())
  }

  // Candidatura → candidato (evita embed ambíguo: busca candidate_id e resolve depois)
  const appToCand: Record<string, string> = {}
  if (appIds.size) {
    const { data: apps } = await service
      .from('applications').select('id, candidate_id').in('id', Array.from(appIds))
    for (const a of apps || []) {
      if (a.candidate_id) { appToCand[a.id as string] = a.candidate_id as string; candidateIds.add(String(a.candidate_id).toLowerCase()) }
    }
  }

  const nameById: Record<string, string> = {}
  if (candidateIds.size) {
    const { data: cands } = await service
      .from('candidates').select('id, full_name').in('id', Array.from(candidateIds))
    for (const c of cands || []) nameById[String(c.id).toLowerCase()] = c.full_name as string
  }

  // Mapa final: tanto IDs de candidato quanto de candidatura → nome do candidato
  const names: Record<string, string> = { ...nameById }
  for (const [appId, candId] of Object.entries(appToCand)) {
    const n = nameById[String(candId).toLowerCase()]
    if (n) names[appId.toLowerCase()] = n
  }

  return <AuditoriaManager logs={(logs || []) as AuditLog[]} names={names} />
}
