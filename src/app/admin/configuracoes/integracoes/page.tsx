import { requireMaster } from '@/lib/auth-guard'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { Plug } from 'lucide-react'
import { D4SignCard } from './d4sign-card'
import { ControlIdCard } from './controlid-card'
import { Mind7Card } from './mind7-card'

export const dynamic = 'force-dynamic'

export default async function IntegracoesPage() {
  await requireMaster()

  const supabase = await createSupabaseServiceClient()
  const { data: d4 } = await supabase
    .from('integrations')
    .select('environment, status, connected_at, meta, account_email')
    .eq('provider', 'd4sign')
    .maybeSingle()

  const d4Status = (d4?.status === 'connected' ? 'connected' : 'disconnected') as 'connected' | 'disconnected'
  const d4Env = (d4?.environment === 'sandbox' ? 'sandbox' : 'producao') as 'producao' | 'sandbox'
  const d4Cofres = ((d4?.meta as { cofres?: number } | null)?.cofres) ?? null

  // Control iD / RHiD
  const { data: cid } = await supabase
    .from('integrations')
    .select('status, connected_at, meta, account_email')
    .eq('provider', 'controlid')
    .maybeSingle()

  const cidMeta = (cid?.meta as { domain?: string | null; cliente?: string | null } | null) ?? null
  const cidStatus = (cid?.status === 'connected' ? 'connected' : 'disconnected') as 'connected' | 'disconnected'

  // Mind7 — painel de consultas
  const { data: m7 } = await supabase
    .from('integrations')
    .select('status, connected_at, meta, account_email')
    .eq('provider', 'mind7')
    .maybeSingle()

  const m7Meta = (m7?.meta as { alcance?: string; alcance_detalhe?: string } | null) ?? null
  const m7Status = (m7?.status === 'connected' ? 'connected' : 'disconnected') as 'connected' | 'disconnected'
  const m7Alcance = m7Meta?.alcance === 'servidor' ? 'servidor'
    : m7Meta?.alcance === 'navegador' ? 'navegador' : null

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
          initialAccountEmail={(d4?.account_email as string | null) ?? ''}
        />

        <ControlIdCard
          initialStatus={cidStatus}
          initialConnectedAt={(cid?.connected_at as string | null) ?? null}
          initialEmail={(cid?.account_email as string | null) ?? ''}
          initialDomain={cidMeta?.domain ?? ''}
          initialCliente={cidMeta?.cliente ?? null}
        />

        <Mind7Card
          initialStatus={m7Status}
          initialConnectedAt={(m7?.connected_at as string | null) ?? null}
          initialUsuario={(m7?.account_email as string | null) ?? ''}
          initialAlcance={m7Alcance}
          initialAlcanceDetalhe={m7Meta?.alcance_detalhe ?? null}
        />
      </div>
    </div>
  )
}
