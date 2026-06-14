import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { UploadDocForm } from './upload-form'

export const dynamic = 'force-dynamic'

export default async function DocumentoPublicPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createSupabaseServiceClient()

  const { data: dr } = await supabase
    .from('doc_requests')
    .select('doc_label, status, candidates(full_name)')
    .eq('token', token).maybeSingle()

  if (!dr) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6 text-center">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Link inválido</h1>
          <p className="text-sm text-muted-foreground mt-1">Este link de envio de documento não é válido.</p>
        </div>
      </div>
    )
  }

  const cand = dr.candidates as { full_name?: string } | { full_name?: string }[] | null
  const candidateName = (Array.isArray(cand) ? cand[0]?.full_name : cand?.full_name) || ''

  return (
    <UploadDocForm
      token={token}
      docLabel={dr.doc_label as string}
      candidateName={candidateName}
      alreadySent={dr.status === 'enviado'}
    />
  )
}
