import { createSupabaseServerClient } from '@/lib/supabase-server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Users, UserCheck, ClipboardList, FlaskConical, Brain, ThumbsUp,
  ThumbsDown, Star, UserPlus, Briefcase, Link2,
} from 'lucide-react'
import { CandidateStatus, STATUS_LABELS } from '@/types'
import { DashboardPublicLink } from './dashboard-public-link'

async function getDashboardStats() {
  const supabase = await createSupabaseServerClient()
  const { data: apps } = await supabase
    .from('applications')
    .select('status, final_score, created_at, job_id, jobs(title)')
    .eq('is_latest', true)

  const { data: candidates } = await supabase
    .from('candidates')
    .select('id, created_at')
    .is('deleted_at', null)

  const statusCounts: Record<string, number> = {}
  apps?.forEach(a => {
    statusCounts[a.status] = (statusCounts[a.status] || 0) + 1
  })

  const thisMonth = new Date()
  thisMonth.setDate(1)
  thisMonth.setHours(0, 0, 0, 0)
  const newThisMonth = candidates?.filter(c => new Date(c.created_at) >= thisMonth).length || 0

  return { statusCounts, total: candidates?.length || 0, newThisMonth, apps: apps || [] }
}

const statCards = [
  { status: null, label: 'Total de Candidatos', icon: Users, color: 'text-blue-600 bg-blue-50' },
  { status: 'novo', label: 'Novos', icon: UserPlus, color: 'text-gray-600 bg-gray-50' },
  { status: 'aguardando_formulario_experiencia', label: 'Aguardando Formulário', icon: ClipboardList, color: 'text-yellow-600 bg-yellow-50' },
  { status: 'aguardando_teste_cultural', label: 'Aguardando Teste', icon: FlaskConical, color: 'text-purple-600 bg-purple-50' },
  { status: 'analise_ia_concluida', label: 'Analisados pela IA', icon: Brain, color: 'text-cyan-600 bg-cyan-50' },
  { status: 'apto_para_entrevista', label: 'Aptos p/ Entrevista', icon: UserCheck, color: 'text-emerald-600 bg-emerald-50' },
  { status: 'aprovado', label: 'Aprovados', icon: ThumbsUp, color: 'text-green-600 bg-green-50' },
  { status: 'reprovado', label: 'Reprovados', icon: ThumbsDown, color: 'text-red-600 bg-red-50' },
  { status: 'banco_de_talentos', label: 'Banco de Talentos', icon: Star, color: 'text-violet-600 bg-violet-50' },
  { status: 'contratado', label: 'Contratados', icon: Briefcase, color: 'text-green-700 bg-green-100' },
]

export default async function DashboardPage() {
  const { statusCounts, total, newThisMonth, apps } = await getDashboardStats()

  const vagaCounts: Record<string, number> = {}
  apps.forEach((a) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const title = (Array.isArray(a.jobs) ? a.jobs[0] : a.jobs as { title?: string } | null)?.title || 'Sem vaga'
    vagaCounts[title] = (vagaCounts[title] || 0) + 1
  })

  // URL pública do formulário de cadastro
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
  const publicUrl = appUrl ? `${appUrl}/curriculo` : '/curriculo'

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-full overflow-x-hidden">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Visão geral do processo seletivo</p>
      </div>

      {/* ── Link público de cadastro ──────────────────────── */}
      <Card className="border-2 border-dashed border-[#e0e0e0]">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            {/* QR Code */}
            <div className="shrink-0 flex flex-col items-center gap-1">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(
                  appUrl ? publicUrl : 'https://recrutamento-selecao-ashen.vercel.app/curriculo'
                )}&bgcolor=ffffff&color=1a1a1a&qzone=1`}
                alt="QR Code do formulário de cadastro"
                width={120}
                height={120}
                className="rounded-lg border border-[#e8e8e8]"
              />
              <span className="text-[10px] text-muted-foreground">Escaneie para cadastrar</span>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Link2 className="w-4 h-4 text-[#555]" />
                <p className="text-sm font-semibold text-[#333]">Link público para cadastro de currículos</p>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Compartilhe este link ou QR Code para que candidatos se cadastrem diretamente no banco de talentos.
              </p>
              <DashboardPublicLink url={appUrl ? publicUrl : 'https://recrutamento-selecao-ashen.vercel.app/curriculo'} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Cards de status ───────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {statCards.map(card => {
          const Icon = card.icon
          const count = card.status === null ? total : (statusCounts[card.status] || 0)
          return (
            <Card key={card.label} className="shadow-sm">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-1.5 sm:p-2 rounded-lg ${card.color}`}>
                    <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </div>
                  <span className="text-xl sm:text-2xl font-bold">{count}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-tight">{card.label}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Candidatos por Vaga</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(vagaCounts).sort((a, b) => b[1] - a[1]).map(([vaga, count]) => (
              <div key={vaga} className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground truncate flex-1">{vaga}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-16 sm:w-24 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${Math.round((count / (apps.length || 1)) * 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium w-6 text-right">{count}</span>
                </div>
              </div>
            ))}
            {!Object.keys(vagaCounts).length && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum candidato ainda</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Candidatos por Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground truncate flex-1">
                  {STATUS_LABELS[status as CandidateStatus] || status}
                </span>
                <span className="text-sm font-medium shrink-0">{count}</span>
              </div>
            ))}
            {!Object.keys(statusCounts).length && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum candidato ainda</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{newThisMonth}</span> candidatos novos este mês
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
