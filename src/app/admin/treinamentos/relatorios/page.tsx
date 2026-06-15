import { requirePermission } from '@/lib/auth-guard'
import { BarChart3 } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function RelatoriosTreinamentosPage() {
  await requirePermission('dashboard.ver')

  return (
    <div className="p-4 sm:p-6 max-w-4xl space-y-6">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <BarChart3 className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Relatórios de treinamentos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Acompanhe a participação e os resultados dos treinamentos.</p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center text-center gap-3 py-16 bg-white rounded-2xl border">
        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
          <BarChart3 className="w-7 h-7 text-gray-300" />
        </div>
        <p className="font-medium text-gray-600">Nenhum relatório disponível ainda</p>
        <p className="text-sm text-muted-foreground max-w-sm">Os relatórios dos treinamentos aparecerão aqui.</p>
      </div>
    </div>
  )
}
