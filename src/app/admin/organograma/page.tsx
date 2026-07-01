import { requirePermission } from '@/lib/auth-guard'
import { Network } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function OrganogramaPage() {
  await requirePermission('organograma.ver')

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Network className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold leading-tight">Organograma</h1>
          <p className="text-sm text-muted-foreground">Estrutura organizacional da empresa</p>
        </div>
      </div>

      {/* Placeholder — conteúdo será definido depois */}
      <div className="bg-white rounded-2xl border shadow-sm p-10 flex flex-col items-center justify-center text-center gap-3 min-h-[300px]">
        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
          <Network className="w-7 h-7 text-gray-300" />
        </div>
        <p className="font-medium text-gray-600">Em construção</p>
        <p className="text-sm text-muted-foreground max-w-sm">
          Este espaço vai receber o organograma da empresa. O conteúdo será configurado em breve.
        </p>
      </div>
    </div>
  )
}
