import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { CultureTestForm } from './culture-test-form'
import { notFound } from 'next/navigation'

export default async function TesteCulturalPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  if (!token) notFound()

  const supabase = await createSupabaseServiceClient()

  const { data: application } = await supabase
    .from('applications')
    .select('*, candidates(full_name)')
    .eq('culture_test_token', token)
    .gte('culture_test_token_expires_at', new Date().toISOString())
    .single()

  if (!application) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-8 text-center space-y-3">
        <p className="text-2xl">⏰</p>
        <h2 className="font-semibold text-lg">Link inválido ou expirado</h2>
        <p className="text-sm text-muted-foreground">Este link não é válido ou já expirou. Entre em contato pelo WhatsApp.</p>
      </div>
    )
  }

  const alreadyAnswered = ['teste_cultural_preenchido', 'analise_ia_concluida', 'apto_para_entrevista', 'entrevista_agendada', 'entrevistado', 'aprovado', 'reprovado', 'banco_de_talentos', 'contratado'].includes(application.status)

  if (alreadyAnswered) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-8 text-center space-y-3">
        <p className="text-2xl">✅</p>
        <h2 className="font-semibold text-lg">Teste já enviado!</h2>
        <p className="text-sm text-muted-foreground">Você já completou o teste cultural. Obrigado!</p>
      </div>
    )
  }

  const { data: questions } = await supabase
    .from('culture_questions')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')

  return (
    <CultureTestForm
      application={application}
      questions={questions || []}
      token={token}
    />
  )
}
