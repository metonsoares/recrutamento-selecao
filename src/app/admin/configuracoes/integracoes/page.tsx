import { requireMaster } from '@/lib/auth-guard'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { Plug } from 'lucide-react'
import { D4SignCard } from './d4sign-card'

export const dynamic = 'force-dynamic'

export default async function IntegracoesPage() {
  await requireMaster()

  const supabase = await createSupabaseServiceClient()
  const { data: d4 } = await supabase
    .from('integrations')
    .select('environment, status, connected_at, meta')
    .eq('provider', 'd4sign')
    .maybeSingle()

  const d4Status = (d4?.status === 'connected' ? 'connected' : 'disconnected') as 'connected' | 'disconnected'
  const d4Env = (d4?.environment === 'sandbox' ? 'sandbox' : 'producao') as 'producao' | 'sandbox'
  const d4Cofres = ((d4?.meta as { cofres?: number } | null)?.cofres) ?? null

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

      {/* Aplicativos */}
      <div className="space-y-4">
        <D4SignCard
          initialStatus={d4Status}
          initialEnvironment={d4Env}
          initialConnectedAt={(d4?.connected_at as string | null) ?? null}
          initialCofres={d4Cofres}
        />
      </div>
    </div>
  )
}
