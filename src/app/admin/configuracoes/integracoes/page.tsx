import { requireMaster } from '@/lib/auth-guard'
import { Plug } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function IntegracoesPage() {
  await requireMaster()

  return (
    <div className="p-4 sm:p-6 max-w-4xl space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Plug className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Integrações</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Conecte aplicativos e serviços externos à plataforma.
          </p>
        </div>
      </div>

      {/* Lista de aplicativos (em breve) */}
      <div className="flex flex-col items-center justify-center text-center gap-3 py-16 bg-white rounded-2xl border">
        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
          <Plug className="w-7 h-7 text-gray-300" />
        </div>
        <p className="font-medium text-gray-600">Nenhuma integração disponível ainda</p>
        <p className="text-sm text-muted-foreground max-w-sm">
          Os aplicativos que farão a integração com a plataforma aparecerão aqui.
        </p>
      </div>
    </div>
  )
}
