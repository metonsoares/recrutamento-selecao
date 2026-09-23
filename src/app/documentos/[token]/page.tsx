import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { docsPendentesFicha } from '@/lib/doc-pendency'
import { EnvioDocumentosForm } from './envio-form'

export const dynamic = 'force-dynamic'

/**
 * Página pública de envio de documentos (link mandado ao colaborador).
 *
 * Mostra SÓ o primeiro nome e a lista do que falta — nada da ficha, nenhum
 * outro dado. A lista é calculada na hora a partir da ficha, então o que já foi
 * enviado some sozinho na próxima abertura.
 */
export default async function DocumentosPublicPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createSupabaseServiceClient()

  const { data: portal } = await supabase
    .from('doc_portals')
    .select('id, candidate_id, application_id, revoked_at')
    .eq('token', token).maybeSingle()

  if (!portal || portal.revoked_at) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6 text-center">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Link inválido</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Este link de envio de documentos não é válido. Peça um novo ao RH.
          </p>
        </div>
      </div>
    )
  }

  const { data: candidate } = await supabase
    .from('candidates').select('full_name').eq('id', portal.candidate_id as string).maybeSingle()

  const { data: app } = await supabase
    .from('applications').select('admission_form')
    .eq('candidate_id', portal.candidate_id as string).eq('is_latest', true).maybeSingle()

  const pendentes = docsPendentesFicha(app?.admission_form as Parameters<typeof docsPendentesFicha>[0])

  await supabase.from('doc_portals')
    .update({ last_opened_at: new Date().toISOString() })
    .eq('id', portal.id as string)

  return (
    <EnvioDocumentosForm
      token={token}
      primeiroNome={String(candidate?.full_name ?? '').trim().split(' ')[0] ?? ''}
      pendentesIniciais={pendentes}
    />
  )
}
