import { createSupabaseServerClient } from '@/lib/supabase-server'
import { STATUS_LABELS, CandidateStatus } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default async function RelatoriosPage() {
  const supabase = await createSupabaseServerClient()

  const { data: applications } = await supabase
    .from('applications')
    .select('status, final_score, culture_score, experience_score, created_at, job_id, jobs(title)')
    .eq('is_latest', true)

  const { data: candidates } = await supabase
    .from('candidates')
    .select('id, created_at')
    .is('deleted_at', null)

  const apps = applications || []
  const totalCandidates = candidates?.length || 0

  const byStatus: Record<string, number> = {}
  apps.forEach(a => { byStatus[a.status] = (byStatus[a.status] || 0) + 1 })

  const byJob: Record<string, number> = {}
  apps.forEach(a => {
    const title = (a.jobs as { title?: string } | null)?.title || 'Sem vaga'
    byJob[title] = (byJob[title] || 0) + 1
  })

  const scored = apps.filter(a => a.final_score != null)
  const avgFinal = scored.length ? scored.reduce((sum, a) => sum + (a.final_score || 0), 0) / scored.length : 0
  const avgCulture = scored.length ? scored.reduce((sum, a) => sum + (a.culture_score || 0), 0) / scored.length : 0

  const approved = byStatus['aprovado'] || 0
  const reprovado = byStatus['reprovado'] || 0
  const total = approved + reprovado
  const taxaAprovacao = total > 0 ? Math.round((approved / total) * 100) : 0

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Relatórios</h1>
        <p className="text-muted-foreground text-sm mt-1">Visão analítica do processo seletivo</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 text-center">
          <p className="text-3xl font-bold">{totalCandidates}</p>
          <p className="text-sm text-muted-foreground">Total de Candidatos</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-3xl font-bold">{avgFinal.toFixed(1)}</p>
          <p className="text-sm text-muted-foreground">Média Nota Final</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-3xl font-bold">{avgCulture.toFixed(1)}</p>
          <p className="text-sm text-muted-foreground">Média Nota Cultural</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-3xl font-bold">{taxaAprovacao}%</p>
          <p className="text-sm text-muted-foreground">Taxa de Aprovação</p>
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Candidatos por Status</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <Badge variant="outline" className="text-xs">{STATUS_LABELS[status as CandidateStatus] || status}</Badge>
                <div className="flex items-center gap-2">
                  <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${(count / totalCandidates) * 100}%` }} />
                  </div>
                  <span className="text-sm font-medium w-6 text-right">{count}</span>
                </div>
              </div>
            ))}
            {!Object.keys(byStatus).length && <p className="text-muted-foreground text-sm">Sem dados</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Candidatos por Vaga</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(byJob).sort((a, b) => b[1] - a[1]).map(([job, count]) => (
              <div key={job} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground truncate">{job}</span>
                <div className="flex items-center gap-2">
                  <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full" style={{ width: `${(count / apps.length) * 100}%` }} />
                  </div>
                  <span className="text-sm font-medium w-6 text-right">{count}</span>
                </div>
              </div>
            ))}
            {!Object.keys(byJob).length && <p className="text-muted-foreground text-sm">Sem dados</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Resumo por Status</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-muted-foreground text-xs">
              <th className="text-left pb-2">Status</th>
              <th className="text-right pb-2">Qtd</th>
              <th className="text-right pb-2">%</th>
            </tr></thead>
            <tbody>
              {Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
                <tr key={status} className="border-b last:border-0">
                  <td className="py-2">{STATUS_LABELS[status as CandidateStatus] || status}</td>
                  <td className="py-2 text-right font-medium">{count}</td>
                  <td className="py-2 text-right text-muted-foreground">{totalCandidates > 0 ? ((count / totalCandidates) * 100).toFixed(1) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
